#!/usr/bin/env tsx
/**
 * Verifies T-08a material processing. Part 1 checks the extractors and the
 * chunker on files built here (synthetic text only). Part 2 runs the real
 * pipeline against the dev database and the developer's own dev Blob
 * store: a fake publisher records each step "complete" and "retry" queue,
 * and the script delivers it to the real `POST /api/jobs/step` handler
 * with a QStash-style signature made from the dev signing key (PRD
 * Section 4: "a fake queue and an authenticated test signature").
 *
 * Prints only pass/fail and short, safe messages. Removes every blob it
 * uploaded, then the test user (spaces, materials and chunks cascade; the
 * jobs are deleted by id).
 *
 * Run with: pnpm run check:processing [-- --http=http://localhost:3000]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, createHmac, randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { put } from "@vercel/blob/client";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { chunks, jobs, materials, studySpaces } from "../src/server/db/schema";
import { serverEnv } from "../src/lib/server-env";
import { setPublisherForChecks, type StepMessage } from "../src/server/jobs/jobs-client";
import { runJobStep } from "../src/server/jobs/jobs-runner";
import { blobExists, deleteBlob } from "../src/server/storage/storage-client";
import { CHUNK_MAX_CHARS, packChunks, type TextUnit } from "../src/features/materials/server/chunk-text";
import { ExtractionError, extractMaterialText, tidy, dropRepeatedLines } from "../src/features/materials/server/extract-text";
import { processMaterialJob } from "../src/features/materials/server";
import type { CreateMaterialResponse, MaterialResponse } from "../src/features/materials/materials-schemas";
import { POST as createRoute } from "../src/app/api/spaces/[spaceId]/materials/route";
import { DELETE as deleteRoute } from "../src/app/api/materials/[id]/route";
import { POST as completeRoute } from "../src/app/api/materials/[id]/complete/route";
import { POST as retryRoute } from "../src/app/api/materials/[id]/retry/route";
import { POST as stepRoute } from "../src/app/api/jobs/step/route";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];
const uploadedPaths = new Set<string>();
const jobIds = new Set<string>();

function check(name: string, ok: boolean, message = "") {
  results.push({ name, ok, message });
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 200);
}

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return error instanceof ExtractionError ? error.code : safeMessage(error);
  }
}

// ---------------------------------------------------------------------------
// Test files
// ---------------------------------------------------------------------------

/** A valid PDF with one Helvetica text line per page (byte offsets computed). */
function makePdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, i) => {
    const content = text
      .split("\n")
      .map((line, j) => `BT /F1 11 Tf 40 ${750 - j * 16} Td (${line.replace(/[()\\]/g, "\\$&")}) Tj ET`)
      .join("\n");
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * A PPTX with the given slides. File numbers run backwards on purpose:
 * `slideN.xml` for slide 1 is the highest N, so the extractor must follow
 * presentation.xml's order, not the file names.
 */
function makePptx(slides: { title: string; body: string; notes?: string }[]): Buffer {
  const n = slides.length;
  const files: Record<string, Uint8Array> = {};
  const para = (text: string) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
  const presRels: string[] = [];
  const sldIds: string[] = [];
  slides.forEach((slide, i) => {
    const file = n - i;
    presRels.push(`<Relationship Id="rId${i + 10}" Target="slides/slide${file}.xml"/>`);
    sldIds.push(`<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`);
    files[`ppt/slides/slide${file}.xml`] = strToU8(
      `<p:sld><p:txBody>${para(slide.title)}${para(slide.body)}<a:p><a:fld type="slidenum"><a:t>${i + 1}</a:t></a:fld></a:p></p:txBody></p:sld>`,
    );
    if (slide.notes) {
      files[`ppt/slides/_rels/slide${file}.xml.rels`] = strToU8(
        `<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide${i + 1}.xml"/></Relationships>`,
      );
      files[`ppt/notesSlides/notesSlide${i + 1}.xml`] = strToU8(`<p:notes>${para(slide.notes)}</p:notes>`);
    }
  });
  files["ppt/presentation.xml"] = strToU8(`<p:presentation><p:sldIdLst>${sldIds.join("")}</p:sldIdLst></p:presentation>`);
  files["ppt/_rels/presentation.xml.rels"] = strToU8(`<Relationships>${presRels.join("")}</Relationships>`);
  files["[Content_Types].xml"] = strToU8("<Types/>");
  return Buffer.from(zipSync(files));
}

const sentence = (i: number) => `Sentence ${i} explains how relational keys link two tables together. `;

// ---------------------------------------------------------------------------
// Part 1: extraction and chunking
// ---------------------------------------------------------------------------

async function unitChecks() {
  // Chunker: many small units, one huge unit, then a short tail.
  const units: TextUnit[] = [
    ...Array.from({ length: 30 }, (_, i) => ({ page: i + 1, text: `Slide ${i + 1}. ${sentence(i)}` })),
    { page: 31, text: Array.from({ length: 120 }, (_, i) => sentence(i)).join("").trim() },
    { page: 32, text: "A short closing note." },
  ];
  const packed = packChunks(units);
  const allText = units.map((u) => u.text).join("");
  check(
    "Chunker: every chunk 1..2,500 characters",
    packed.every((c) => c.content.length > 0 && c.content.length <= CHUNK_MAX_CHARS),
    packed.map((c) => c.content.length).join(","),
  );
  check(
    "Chunker: no overlap and nothing lost (text in order, separators aside)",
    packed.map((c) => c.content).join("").replace(/\s+/g, "") === allText.replace(/\s+/g, ""),
  );
  check(
    "Chunker: page ranges in order and never backwards",
    packed.every((c, i) => c.pageStart <= c.pageEnd && (i === 0 || c.pageStart >= packed[i - 1].pageEnd)),
  );
  check("Chunker: small slides combine into one chunk", packed[0].pageStart === 1 && packed[0].pageEnd > 1);
  check(
    "Chunker: a unit over 2,500 is split at sentence ends",
    packed.filter((c) => c.pageStart === 31 && c.pageEnd === 31).length >= 2 &&
      packed.filter((c) => c.pageStart === 31 && c.pageEnd === 31).every((c) => c.content.trim().endsWith(".")),
  );
  check("Chunker: a short last chunk joins the one before", packed.at(-1)!.content.endsWith("A short closing note.") && packed.at(-1)!.content.length >= 300);

  check("Clean: words hyphenated across lines are joined", tidy("rela-\ntional  keys") === "relational keys");
  const repeated = dropRepeatedLines(
    ["alpha", "beta", "gamma", "delta"].map((w, i) => ({ page: i + 1, text: `Database Systems\nUnique ${w} text\nPage ${i + 1} of 4` })),
  );
  check(
    "Clean: headers and page numbers on most pages are dropped",
    repeated.every((u) => /^Unique [a-z]+ text$/.test(u.text)),
    JSON.stringify(repeated[0].text),
  );

  const txt = await extractMaterialText("notes.txt", Buffer.from("First paragraph.\n\n\nSecond   paragraph\nline two.\r\n\r\nThird."));
  check(
    "TXT: blank-line paragraphs become numbered sections",
    txt.units.length === 3 && txt.units[1].page === 2 && txt.units[1].text === "Second paragraph\nline two.",
    JSON.stringify(txt.units),
  );
  check("TXT: only whitespace fails NO_READABLE_TEXT", (await failureCode(extractMaterialText("a.txt", Buffer.from(" \n\n \t")))) === "NO_READABLE_TEXT");
  check(
    "TXT: over 240,000 characters fails TOO_MUCH_TEXT",
    (await failureCode(extractMaterialText("a.txt", Buffer.from("word ".repeat(50_000))))) === "TOO_MUCH_TEXT",
  );

  const pdf = await extractMaterialText("a.pdf", makePdf(["Primary keys identify rows.", "Foreign keys reference them."]));
  check(
    "PDF: text per page with page numbers",
    pdf.pageCount === 2 && pdf.units[0].text.includes("Primary keys") && pdf.units[1].page === 2 && pdf.units[1].text.includes("Foreign keys"),
    JSON.stringify(pdf.units).slice(0, 160),
  );
  check(
    "PDF: 201 pages fails TOO_MANY_PAGES",
    (await failureCode(extractMaterialText("a.pdf", makePdf(Array.from({ length: 201 }, (_, i) => `Page ${i}`))))) === "TOO_MANY_PAGES",
  );
  check("PDF: pages with no text fail NO_READABLE_TEXT", (await failureCode(extractMaterialText("a.pdf", makePdf(["", ""])))) === "NO_READABLE_TEXT");
  check("PDF: a corrupt file fails PROCESSING_FAILED", (await failureCode(extractMaterialText("a.pdf", Buffer.from("%PDF-1.4 garbage")))) === "PROCESSING_FAILED");

  const pptx = await extractMaterialText(
    "a.pptx",
    makePptx([
      { title: "Keys &amp; constraints", body: "Primary keys are unique.", notes: "Say this slowly." },
      { title: "Joins", body: "Inner joins match rows." },
    ]),
  );
  check(
    "PPTX: slides in presentation order, with title, body and speaker notes",
    pptx.pageCount === 2 &&
      pptx.units[0].text === "Keys & constraints\nPrimary keys are unique.\n\nNotes: Say this slowly." &&
      pptx.units[1].text === "Joins\nInner joins match rows.",
    JSON.stringify(pptx.units),
  );
  check(
    "PPTX: 201 slides fails TOO_MANY_PAGES",
    (await failureCode(extractMaterialText("a.pptx", makePptx(Array.from({ length: 201 }, (_, i) => ({ title: `S${i}`, body: "x" })))))) ===
      "TOO_MANY_PAGES",
  );
  check("PPTX: not a real ZIP fails PROCESSING_FAILED", (await failureCode(extractMaterialText("a.pptx", Buffer.from("PK\u0003\u0004 nope")))) === "PROCESSING_FAILED");
}

// ---------------------------------------------------------------------------
// Part 2: the pipeline end to end
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:3000";
/** `--http=http://localhost:3000`: deliver steps over HTTP to a running `next start`, so the bundled route is tested too. */
const HTTP_BASE = process.argv.find((a) => a.startsWith("--http="))?.slice("--http=".length);
const base64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** A QStash-style signature: an HS256 JWT over the body's SHA-256 (Receiver.verify). */
function sign(body: string, key = serverEnv().QSTASH_CURRENT_SIGNING_KEY): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: "Upstash",
      sub: `${BASE_URL}/api/jobs/step`,
      iat: now,
      nbf: now,
      exp: now + 300,
      jti: randomUUID(),
      body: base64url(createHash("sha256").update(body).digest()),
    }),
  );
  const signature = base64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

function deliver(message: StepMessage, signature: string | null = sign(JSON.stringify(message)), body = JSON.stringify(message)) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("upstash-signature", signature);
  if (HTTP_BASE) return fetch(`${HTTP_BASE}/api/jobs/step`, { method: "POST", headers, body });
  return stepRoute(new Request(`${BASE_URL}/api/jobs/step`, { method: "POST", headers, body }));
}

async function e2eChecks(userId: string, cookie: string | undefined) {
  const published: StepMessage[] = [];
  let publishFails = false;
  setPublisherForChecks(async (message) => {
    if (publishFails) throw new Error("QStash unavailable (simulated)");
    published.push(message);
    jobIds.add(message.jobId);
  });

  const [space] = await db.insert(studySpaces).values({ ownerId: userId, name: "Processing check" }).returning();
  const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (path: string) => new Request(`${BASE_URL}${path}`, { method: "POST", headers: { cookie: cookie ?? "" } });
  const materialRow = async (id: string) => (await db.select().from(materials).where(eq(materials.id, id)))[0];
  const jobRow = async (materialId: string) => (await db.select().from(jobs).where(eq(jobs.targetId, materialId)))[0];
  const chunkCount = async (materialId: string) =>
    (await db.select({ n: count() }).from(chunks).where(eq(chunks.materialId, materialId)))[0].n;

  /** create → browser upload → complete; returns the material and the step "complete" queued. */
  async function upload(name: string, bytes: Buffer, contentType: string) {
    const created = await createRoute(
      new Request(`${BASE_URL}/api/spaces/${space.id}/materials`, {
        method: "POST",
        headers: { cookie: cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({ name, size: bytes.length, contentType }),
      }),
      { params: Promise.resolve({ spaceId: space.id }) },
    );
    const { material, upload } = (await created.json()) as CreateMaterialResponse;
    await put(upload.pathname, bytes, { access: "private", token: upload.clientToken, contentType });
    uploadedPaths.add(upload.pathname);
    const before = published.length;
    const completed = await completeRoute(post(`/api/materials/${material.id}/complete`), idParams(material.id));
    const body = (await completed.json()) as { material: MaterialResponse };
    return { id: material.id, blobPath: upload.pathname, material: body.material, message: published[before] };
  }

  // --- Happy path: a PDF ---------------------------------------------------
  const pages = Array.from(
    { length: 4 },
    (_, p) => `Database Systems\n${Array.from({ length: 6 }, (_, i) => sentence(p * 10 + i)).join("\n")}\nPage ${p + 1}`,
  );
  const pdf = await upload("keys.pdf", makePdf(pages), "application/pdf");
  check(
    "Complete queues one `extract` step; material processing at stage extract",
    pdf.message?.step === "extract" && pdf.material.status === "processing" && pdf.material.stage === "extract",
    JSON.stringify(pdf.message ?? null),
  );
  const queued = await jobRow(pdf.id);
  check(
    "Job row: process_material, queued, scoped to the user and space, keyed by material",
    queued?.kind === "process_material" &&
      queued.status === "queued" &&
      queued.userId === userId &&
      queued.spaceId === space.id &&
      queued.idempotencyKey === `process_material:${pdf.id}` &&
      queued.payload === null,
  );

  check("Step route: no signature → 401", (await deliver(pdf.message, null)).status === 401);
  check("Step route: wrong signing key → 401", (await deliver(pdf.message, sign(JSON.stringify(pdf.message), "not-the-key"))).status === 401);
  const forged = JSON.stringify({ ...pdf.message, step: "embed" });
  check("Step route: signature for a different body → 401", (await deliver(pdf.message, sign(forged))).status === 401);
  check("Step route: signed but malformed → 400", (await deliver(pdf.message, sign("{}"), "{}")).status === 400);
  check("Nothing ran for rejected deliveries", (await chunkCount(pdf.id)) === 0 && (await jobRow(pdf.id)).attemptCount === 0);

  const ran = await deliver(pdf.message);
  const afterPdf = await materialRow(pdf.id);
  const pdfChunks = await db.select().from(chunks).where(eq(chunks.materialId, pdf.id)).orderBy(chunks.chunkIndex);
  check("Signed delivery → 200", ran.status === 200, `${ran.status}`);
  check(
    "PDF: chunks saved in order with page ranges, space and no embedding yet",
    pdfChunks.length > 0 &&
      pdfChunks.every((c, i) => c.chunkIndex === i && c.spaceId === space.id && c.embedding === null && c.pageStart >= 1 && c.pageEnd <= 4),
    `${pdfChunks.length} chunk(s)`,
  );
  check(
    "PDF: repeated header and page numbers are not in the chunks",
    pdfChunks.every((c) => !c.content.includes("Database Systems") && !/^Page \d$/m.test(c.content)),
  );
  check(
    "Material: still processing, stage embed, 0 of N, page and character counts",
    afterPdf.status === "processing" &&
      afterPdf.stage === "embed" &&
      afterPdf.progressDone === 0 &&
      afterPdf.progressTotal === pdfChunks.length &&
      afterPdf.pageCount === 4 &&
      (afterPdf.charCount ?? 0) > 0,
  );
  const parked = await jobRow(pdf.id);
  check(
    "Job: parked at step embed, queued, claim released (T-08b continues it)",
    parked.step === "embed" && parked.status === "queued" && parked.claimToken === null && parked.attemptCount === 0,
  );

  const replay = await deliver(pdf.message);
  check(
    "Duplicate delivery of a finished step: 200, does nothing",
    replay.status === 200 && ((await replay.json()) as { outcome: string }).outcome === "skipped" && (await chunkCount(pdf.id)) === pdfChunks.length,
  );

  // --- PPTX and TXT ----------------------------------------------------------
  const pptx = await upload(
    "slides.pptx",
    makePptx([
      { title: "Normal forms", body: "First normal form removes repeating groups.", notes: "Mention atomic values." },
      { title: "Second normal form", body: "No partial dependencies on a composite key." },
    ]),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  await deliver(pptx.message);
  const pptxChunks = await db.select().from(chunks).where(eq(chunks.materialId, pptx.id));
  check(
    "PPTX: one chunk covering slides 1–2, with the speaker notes",
    pptxChunks.length === 1 && pptxChunks[0].pageStart === 1 && pptxChunks[0].pageEnd === 2 && pptxChunks[0].content.includes("Mention atomic values."),
  );

  // --- Concurrent deliveries: only one claims --------------------------------
  const txt = await upload("para.txt", Buffer.from(Array.from({ length: 40 }, (_, i) => sentence(i)).join("\n\n")), "text/plain");
  const outcomes = await Promise.all([runJobStep(txt.message), runJobStep(txt.message)]);
  check("Two simultaneous deliveries: one runs, one is skipped", outcomes.sort().join(",") === "done,skipped", outcomes.join(","));
  const txtChunks = await chunkCount(txt.id);
  check("TXT: chunks saved once", txtChunks > 0 && (await materialRow(txt.id)).stage === "embed", `${txtChunks}`);

  // --- A stale claim commits nothing; an expired lease is recovered ----------
  const stale = await upload("stale.txt", Buffer.from("Stale claim test paragraph. ".repeat(20)), "text/plain");
  await db.update(jobs).set({ status: "running", claimToken: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) }).where(eq(jobs.targetId, stale.id));
  check("A live lease blocks a second delivery", (await runJobStep(stale.message)) === "skipped");
  const staleJob = await jobRow(stale.id);
  await processMaterialJob.run({ ...staleJob, claimToken: randomUUID() });
  check("A worker whose claim was taken commits nothing", (await chunkCount(stale.id)) === 0 && (await materialRow(stale.id)).stage === "extract");
  await db.update(jobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(jobs.targetId, stale.id));
  check(
    "An expired lease is reclaimed and the step finishes",
    (await runJobStep(stale.message)) === "done" && (await chunkCount(stale.id)) > 0,
  );

  // --- A failure the file always hits, then Retry ---------------------------
  const blank = await upload("blank.txt", Buffer.from(" \n\n \n"), "text/plain");
  await deliver(blank.message);
  const blankRow = await materialRow(blank.id);
  const blankJob = await jobRow(blank.id);
  check(
    "No readable text: material failed with NO_READABLE_TEXT, job failed and finished",
    blankRow.status === "failed" && blankRow.errorCode === "NO_READABLE_TEXT" && blankJob.status === "failed" && blankJob.finishedAt !== null,
  );
  const before = published.length;
  const retried = await retryRoute(post(`/api/materials/${blank.id}/retry`), idParams(blank.id));
  const retriedJob = await jobRow(blank.id);
  check(
    "Retry: 202, same job reset to its failed step with a fresh budget, step published",
    retried.status === 202 &&
      retriedJob.id === blankJob.id &&
      retriedJob.status === "queued" &&
      retriedJob.attemptCount === 0 &&
      retriedJob.finishedAt === null &&
      published[before]?.step === "extract" &&
      (await materialRow(blank.id)).stage === "extract",
  );

  // --- Transient failures: 503 until the budget runs out ---------------------
  const lost = await upload("lost.txt", Buffer.from("This file will vanish. ".repeat(20)), "text/plain");
  await deleteBlob(lost.blobPath);
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await deliver(lost.message)).status);
  const lostRow = await materialRow(lost.id);
  check(
    "Unreadable file: 503, 503, then 200 with the material failed PROCESSING_FAILED",
    statuses.join(",") === "503,503,200" && lostRow.status === "failed" && lostRow.errorCode === "PROCESSING_FAILED",
    statuses.join(","),
  );

  // --- Deleted while processing ------------------------------------------------
  const gone = await upload("gone.txt", Buffer.from("Deleted before processing. ".repeat(20)), "text/plain");
  await deleteRoute(new Request(`${BASE_URL}/api/materials/${gone.id}`, { method: "DELETE", headers: { cookie: cookie ?? "" } }), idParams(gone.id));
  const goneRun = await deliver(gone.message);
  const goneJob = (await db.select().from(jobs).where(eq(jobs.id, gone.message.jobId)))[0];
  check("Deleted material: step ends cleanly, job failed MATERIAL_GONE", goneRun.status === 200 && goneJob.status === "failed" && goneJob.errorCode === "MATERIAL_GONE");

  await deleteRoute(new Request(`${BASE_URL}/api/materials/${pdf.id}`, { method: "DELETE", headers: { cookie: cookie ?? "" } }), idParams(pdf.id));
  check("Deleting a material deletes its chunks", (await chunkCount(pdf.id)) === 0);

  // --- QStash refuses the publish ---------------------------------------------
  publishFails = true;
  const unpublished = await upload("unpublished.txt", Buffer.from("Publish will fail. ".repeat(20)), "text/plain");
  publishFails = false;
  const unpublishedJob = await jobRow(unpublished.id);
  jobIds.add(unpublishedJob.id);
  check(
    "Publish failure: complete returns failed PROCESSING_FAILED, so Retry is offered",
    unpublished.material.status === "failed" && unpublished.material.error?.code === "PROCESSING_FAILED" && unpublishedJob.status === "failed",
  );
}

async function main() {
  await unitChecks();

  const testAuth = buildTestAuth();
  const test = (await testAuth.$context).test;
  const saved = await test.saveUser(
    test.createUser({ email: `check-processing-${Date.now()}@example.com`, name: "Check Processing", role: "student" }),
  );
  const { headers } = await test.login({ userId: saved.id });
  try {
    await e2eChecks(saved.id, headers.get("cookie") ?? undefined);
  } catch (error) {
    check("End-to-end run completed", false, safeMessage(error));
  } finally {
    setPublisherForChecks(undefined);
    if (uploadedPaths.size) await deleteBlob([...uploadedPaths]).catch(() => undefined);
    const leftover = (await Promise.all([...uploadedPaths].map(blobExists))).some(Boolean);
    await test.deleteUser(saved.id);
    // Jobs outlive their user by design (user_id is set to null), so delete them by id.
    if (jobIds.size) await db.delete(jobs).where(inArray(jobs.id, [...jobIds]));
    check("Cleanup: blobs, test user and jobs removed", !leftover);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
