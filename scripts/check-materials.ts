#!/usr/bin/env tsx
/**
 * Verifies the T-06b Materials API end to end against the real dev
 * database and the developer's own dev Blob store. Built like
 * `check-spaces.ts`: a test-only auth instance creates two students, then
 * the real route handlers are called as Next.js would call them. The
 * browser upload is simulated with `put()` from `@vercel/blob/client` and
 * the token the create route returns.
 *
 * Prints only pass/fail and short, safe messages. Removes every blob it
 * uploaded, then the two users (their spaces and materials cascade).
 *
 * Run with: pnpm run check:materials
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob/client";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { materials, studySpaces } from "../src/server/db/schema";
import { serverEnv } from "../src/lib/server-env";
import { blobExists, createUploadToken, deleteBlob } from "../src/server/storage/storage-client";
import { ACCEPTED_FILE_TYPES, MAX_MATERIAL_BYTES } from "../src/features/materials/materials-schemas";
import type { CreateMaterialResponse, MaterialResponse } from "../src/features/materials/materials-schemas";
import { GET as listRoute, POST as createRoute } from "../src/app/api/spaces/[spaceId]/materials/route";
import { DELETE as deleteRoute } from "../src/app/api/materials/[id]/route";
import { POST as completeRoute } from "../src/app/api/materials/[id]/complete/route";
import { POST as retryRoute } from "../src/app/api/materials/[id]/retry/route";
import { GET as fileRoute } from "../src/app/api/materials/[id]/file/route";

type CheckResult = { name: string; ok: boolean; message: string };
type ErrorBody = { error?: { code?: string; message?: string } };

const BASE_URL = "http://localhost:3000";
const PDF_MIME = "application/pdf";
const TXT_MIME = "text/plain";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const MALFORMED_ID = "not-a-uuid";
const NOT_FOUND_BODY = JSON.stringify({ error: { code: "MATERIAL_NOT_FOUND", message: "Material not found." } });
const PUBLIC_KEYS = ["createdAt", "error", "id", "originalName", "pageCount", "progress", "stage", "status", "updatedAt"];

const results: CheckResult[] = [];
const uploadedPaths = new Set<string>();

function check(name: string, ok: boolean, message = "") {
  results.push({ name, ok, message });
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 200);
}

function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE_URL}${path}`, { ...rest, headers });
}

const spaceParams = (spaceId: string) => ({ params: Promise.resolve({ spaceId }) });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** The browser's `put()`; returns an error message, or null on success. */
async function browserUpload(pathname: string, clientToken: string, body: Buffer, contentType: string) {
  try {
    await put(pathname, body, { access: "private", token: clientToken, contentType });
    uploadedPaths.add(pathname);
    return null;
  } catch (error) {
    return safeMessage(error);
  }
}

async function main() {
  const testAuth = buildTestAuth();
  const test = (await testAuth.$context).test;
  const stamp = Date.now();

  async function createUserSession(label: string) {
    const saved = await test.saveUser(
      test.createUser({ email: `check-materials-${label}-${stamp}@example.com`, name: `Check Materials ${label}`, role: "student" }),
    );
    const { headers } = await test.login({ userId: saved.id });
    return { userId: saved.id, cookie: headers.get("cookie") ?? undefined };
  }

  const userA = await createUserSession("a");
  const userB = await createUserSession("b");

  try {
    await run(userA, userB, stamp);
  } finally {
    // Blobs first: the user cascade removes rows, not files.
    if (uploadedPaths.size) await deleteBlob([...uploadedPaths]).catch(() => undefined);
    const leftover = (await Promise.all([...uploadedPaths].map(blobExists))).some(Boolean);
    await test.deleteUser(userA.userId);
    await test.deleteUser(userB.userId);
    check("Cleanup: blobs and test users removed", !leftover, `${uploadedPaths.size} blob path(s)`);
  }
}

type Session = { userId: string; cookie: string | undefined };

async function run(userA: Session, userB: Session, stamp: number) {
  const [spaceA] = await db.insert(studySpaces).values({ ownerId: userA.userId, name: "Materials check" }).returning();
  const [spaceB] = await db.insert(studySpaces).values({ ownerId: userB.userId, name: "B's space" }).returning();

  const create = async (cookie: string | undefined, spaceId: string, body: unknown) => {
    const response = await createRoute(
      request(`/api/spaces/${spaceId}/materials`, { method: "POST", cookie, body: JSON.stringify(body) }),
      spaceParams(spaceId),
    );
    return { status: response.status, body: await json<CreateMaterialResponse & ErrorBody>(response) };
  };
  const complete = (cookie: string | undefined, id: string) =>
    completeRoute(request(`/api/materials/${id}/complete`, { method: "POST", cookie }), idParams(id));
  const retry = (cookie: string | undefined, id: string) =>
    retryRoute(request(`/api/materials/${id}/retry`, { method: "POST", cookie }), idParams(id));
  const download = (cookie: string | undefined, id: string) =>
    fileRoute(request(`/api/materials/${id}/file`, { cookie }), idParams(id));
  const remove = (cookie: string | undefined, id: string) =>
    deleteRoute(request(`/api/materials/${id}`, { method: "DELETE", cookie }), idParams(id));
  const list = async (cookie: string | undefined, spaceId: string) =>
    listRoute(request(`/api/spaces/${spaceId}/materials`, { cookie }), spaceParams(spaceId));
  const rowOf = async (id: string) => (await db.select().from(materials).where(eq(materials.id, id)))[0];

  const pdfBytes = Buffer.from(`%PDF-1.4\n% check-materials ${stamp}\n%%EOF\n`);
  const txtBytes = Buffer.from(`Check materials notes ${stamp}\nPlain UTF-8 text: café.\n`);
  const fakePdfBytes = Buffer.from(`This is plain text pretending to be a PDF ${stamp}`);

  // --- No session ---------------------------------------------------------
  const unauth = await Promise.all([
    list(undefined, spaceA.id),
    createRoute(request(`/api/spaces/${spaceA.id}/materials`, { method: "POST", body: "{}" }), spaceParams(spaceA.id)),
    complete(undefined, MISSING_ID),
    retry(undefined, MISSING_ID),
    download(undefined, MISSING_ID),
    remove(undefined, MISSING_ID),
  ]);
  check("No session: 401 on all six routes", unauth.every((r) => r.status === 401), unauth.map((r) => r.status).join(","));

  // --- Create ---------------------------------------------------------------
  const pdf = await create(userA.cookie, spaceA.id, {
    name: "  Lecture 1.PDF ",
    size: pdfBytes.length,
    contentType: PDF_MIME,
    ownerId: userB.userId,
  });
  const pdfId = pdf.body.material?.id;
  check(
    "Create: 201, uploading, token and server-made pathname",
    pdf.status === 201 &&
      pdf.body.material?.status === "uploading" &&
      pdf.body.material.originalName === "Lecture 1.PDF" &&
      typeof pdf.body.upload?.clientToken === "string" &&
      pdf.body.upload.pathname === `materials/${pdfId}.pdf`,
    `status ${pdf.status}, pathname ${pdf.body.upload?.pathname}`,
  );
  check(
    "Create: response holds only public material fields",
    JSON.stringify(Object.keys(pdf.body.material ?? {}).sort()) === JSON.stringify(PUBLIC_KEYS),
    Object.keys(pdf.body.material ?? {}).join(","),
  );
  if (!pdfId) throw new Error("create failed; aborting");

  const badCases: [string, unknown, string, number][] = [
    ["wrong type", { name: "notes.docx", size: 10, contentType: "" }, "UNSUPPORTED_FILE_TYPE", 400],
    ["over 10 MB", { name: "big.pdf", size: MAX_MATERIAL_BYTES + 1, contentType: PDF_MIME }, "FILE_TOO_LARGE", 400],
    ["empty name", { name: "   ", size: 10, contentType: "" }, "VALIDATION_ERROR", 400],
    ["invalid JSON", "not json", "VALIDATION_ERROR", 400],
  ];
  for (const [label, body, code, status] of badCases) {
    const response =
      label === "invalid JSON"
        ? await createRoute(
            request(`/api/spaces/${spaceA.id}/materials`, { method: "POST", cookie: userA.cookie, body: "{" }),
            spaceParams(spaceA.id),
          ).then(async (r) => ({ status: r.status, body: await json<ErrorBody>(r) }))
        : await create(userA.cookie, spaceA.id, body);
    check(`Create rejects ${label}: ${status} ${code}`, response.status === status && response.body.error?.code === code, `got ${response.status} ${response.body.error?.code}`);
  }

  const otherSpace = await create(userA.cookie, spaceB.id, { name: "x.pdf", size: 10, contentType: PDF_MIME });
  check("Create in another student's space: 404 SPACE_NOT_FOUND", otherSpace.status === 404 && otherSpace.body.error?.code === "SPACE_NOT_FOUND", `${otherSpace.status}`);

  // --- Token limits -----------------------------------------------------------
  const token = pdf.body.upload.clientToken;
  const wrongPath = await browserUpload(`materials/${randomUUID()}.pdf`, token, pdfBytes, PDF_MIME);
  const wrongType = await browserUpload(pdf.body.upload.pathname, token, pdfBytes, "image/png");
  const tooBig = await browserUpload(pdf.body.upload.pathname, token, Buffer.alloc(MAX_MATERIAL_BYTES + 1, 32), PDF_MIME);
  check("Token rejects a different path", wrongPath !== null, wrongPath ?? "uploaded!");
  check("Token rejects a disallowed type", wrongType !== null, wrongType ?? "uploaded!");
  check("Token rejects more than 10 MB", tooBig !== null, tooBig ?? "uploaded!");

  const expiringPath = `materials/${randomUUID()}.txt`;
  const expiring = await createUploadToken({
    pathname: expiringPath,
    allowedContentTypes: ACCEPTED_FILE_TYPES.map((t) => t.mimeType),
    maxBytes: MAX_MATERIAL_BYTES,
    validUntil: Date.now() + 1000,
  });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const expired = await browserUpload(expiringPath, expiring, txtBytes, TXT_MIME);
  check("Token stops working after it expires", expired !== null, expired ?? "uploaded!");

  // --- Complete ---------------------------------------------------------------
  const early = await complete(userA.cookie, pdfId);
  const earlyBody = await json<ErrorBody>(early);
  check("Complete before upload: 409 UPLOAD_INCOMPLETE, still uploading", early.status === 409 && earlyBody.error?.code === "UPLOAD_INCOMPLETE" && (await rowOf(pdfId))?.status === "uploading", `${early.status}`);

  const pdfUpload = await browserUpload(pdf.body.upload.pathname, token, pdfBytes, PDF_MIME);
  check("Browser upload of a small PDF succeeds", pdfUpload === null, pdfUpload ?? "");
  const pdfDone = await complete(userA.cookie, pdfId);
  const pdfDoneBody = await json<{ material: MaterialResponse }>(pdfDone);
  check("Complete PDF: 200, processing", pdfDone.status === 200 && pdfDoneBody.material.status === "processing", `${pdfDone.status} ${pdfDoneBody.material?.status}`);
  const pdfAgain = await complete(userA.cookie, pdfId);
  const pdfAgainBody = await json<{ material: MaterialResponse }>(pdfAgain);
  check("Complete twice returns the same material", pdfAgain.status === 200 && pdfAgainBody.material.id === pdfId && pdfAgainBody.material.status === "processing", `${pdfAgain.status}`);

  const txt = await create(userA.cookie, spaceA.id, { name: "notes.txt", size: txtBytes.length, contentType: "" });
  await browserUpload(txt.body.upload.pathname, txt.body.upload.clientToken, txtBytes, TXT_MIME);
  const txtDone = await complete(userA.cookie, txt.body.material.id);
  check("Complete TXT: 200, processing", txtDone.status === 200 && (await json<{ material: MaterialResponse }>(txtDone)).material.status === "processing", `${txtDone.status}`);

  async function expectRejected(label: string, name: string, bytes: Buffer, mime: string, code: string, status: number) {
    const created = await create(userA.cookie, spaceA.id, { name, size: bytes.length, contentType: mime });
    const { material, upload } = created.body;
    await browserUpload(upload.pathname, upload.clientToken, bytes, mime);
    const response = await complete(userA.cookie, material.id);
    const body = await json<ErrorBody>(response);
    const rowGone = !(await rowOf(material.id));
    const blobGone = !(await blobExists(upload.pathname));
    check(`${label}: ${status} ${code}, row and blob gone`, response.status === status && body.error?.code === code && rowGone && blobGone, `got ${response.status} ${body.error?.code}, rowGone ${rowGone}, blobGone ${blobGone}`);
  }
  await expectRejected("A .pdf that isn't a PDF", "fake.pdf", fakePdfBytes, PDF_MIME, "UNSUPPORTED_FILE_TYPE", 400);
  await expectRejected("The same PDF twice in one space", "copy of lecture.pdf", pdfBytes, PDF_MIME, "DUPLICATE_FILE", 409);

  // --- Ownership ----------------------------------------------------------------
  const bAttempts = [
    await complete(userB.cookie, pdfId),
    await retry(userB.cookie, pdfId),
    await download(userB.cookie, pdfId),
    await remove(userB.cookie, pdfId),
  ];
  const bTexts = await Promise.all(bAttempts.map((r) => r.text()));
  const bList = await list(userB.cookie, spaceA.id);
  check(
    "Student B: complete/retry/download/delete A's material give the identical 404; list gives SPACE_NOT_FOUND",
    bAttempts.every((r) => r.status === 404) && bTexts.every((t) => t === NOT_FOUND_BODY) && bList.status === 404,
    bAttempts.map((r) => r.status).join(","),
  );
  check("A's material unchanged after B's attempts", (await rowOf(pdfId))?.status === "processing" && (await blobExists(`materials/${pdfId}.pdf`)));

  const missing = await complete(userA.cookie, MISSING_ID);
  const malformed = await download(userA.cookie, MALFORMED_ID);
  check("Missing and malformed IDs give the identical 404", missing.status === 404 && (await missing.text()) === NOT_FOUND_BODY && malformed.status === 404 && (await malformed.text()) === NOT_FOUND_BODY);

  // --- List ---------------------------------------------------------------------
  const listed = await json<{ materials: MaterialResponse[] }>(await list(userA.cookie, spaceA.id));
  check(
    "List: owner sees materials newest first",
    listed.materials.length === 2 && listed.materials[0].id === txt.body.material.id && listed.materials[1].id === pdfId,
    `${listed.materials.length} item(s)`,
  );

  // --- Download -----------------------------------------------------------------
  const file = await download(userA.cookie, pdfId);
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const disposition = file.headers.get("content-disposition") ?? "";
  check(
    "Download: owner gets the original bytes as an attachment",
    file.status === 200 && fileBytes.equals(pdfBytes) && disposition.startsWith("attachment;") && disposition.includes("filename*=UTF-8''Lecture%201.PDF"),
    `${file.status}, ${disposition}`,
  );
  const pending = await create(userA.cookie, spaceA.id, { name: "pending.txt", size: 5, contentType: TXT_MIME });
  const pendingDownload = await download(userA.cookie, pending.body.material.id);
  check("Download while uploading: 409 INVALID_MATERIAL_STATE", pendingDownload.status === 409 && (await json<ErrorBody>(pendingDownload)).error?.code === "INVALID_MATERIAL_STATE");

  // --- Retry --------------------------------------------------------------------
  const notFailed = await retry(userA.cookie, pdfId);
  check("Retry from processing: 409 INVALID_MATERIAL_STATE", notFailed.status === 409 && (await json<ErrorBody>(notFailed)).error?.code === "INVALID_MATERIAL_STATE");
  await db.update(materials).set({ status: "failed", errorCode: "PROCESSING_FAILED" }).where(eq(materials.id, pdfId));
  const failedList = await json<{ materials: MaterialResponse[] }>(await list(userA.cookie, spaceA.id));
  check("A failed material lists its reason", failedList.materials.find((m) => m.id === pdfId)?.error?.code === "PROCESSING_FAILED");
  const retried = await retry(userA.cookie, pdfId);
  const retriedBody = await json<{ material: MaterialResponse }>(retried);
  check("Retry from failed: 202, processing, reason cleared", retried.status === 202 && retriedBody.material.status === "processing" && retriedBody.material.error === null, `${retried.status}`);

  // --- Delete -------------------------------------------------------------------
  // Forced Blob failure: point the cached env at a bad token for one call.
  const env = serverEnv();
  const realToken = env.BLOB_READ_WRITE_TOKEN;
  env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_invalid_check_materials_token";
  let failedDelete: Response;
  try {
    failedDelete = await remove(userA.cookie, txt.body.material.id);
  } finally {
    env.BLOB_READ_WRITE_TOKEN = realToken;
  }
  check(
    "Blob delete fails: 503 MATERIAL_DELETE_FAILED, row and blob kept",
    failedDelete.status === 503 &&
      (await json<ErrorBody>(failedDelete)).error?.code === "MATERIAL_DELETE_FAILED" &&
      !!(await rowOf(txt.body.material.id)) &&
      (await blobExists(txt.body.upload.pathname)),
    `${failedDelete.status}`,
  );

  const deleted = await remove(userA.cookie, txt.body.material.id);
  check("Delete: 204, row and blob gone", deleted.status === 204 && !(await rowOf(txt.body.material.id)) && !(await blobExists(txt.body.upload.pathname)), `${deleted.status}`);
  const deletedAgain = await remove(userA.cookie, txt.body.material.id);
  check("Second delete: 404 MATERIAL_NOT_FOUND", deletedAgain.status === 404 && (await deletedAgain.text()) === NOT_FOUND_BODY);
  const cancelled = await remove(userA.cookie, pending.body.material.id);
  check("Cancel (delete while uploading): 204", cancelled.status === 204 && !(await rowOf(pending.body.material.id)), `${cancelled.status}`);

  // --- 20-material limit --------------------------------------------------------
  // spaceA holds 1 material (the PDF); fill it to 20 with direct rows.
  await db.insert(materials).values(
    Array.from({ length: 19 }, (_, i) => {
      const id = randomUUID();
      return { id, spaceId: spaceA.id, originalName: `filler-${i}.txt`, blobPath: `materials/${id}.txt` };
    }),
  );
  const twentyFirst = await create(userA.cookie, spaceA.id, { name: "one-too-many.pdf", size: 10, contentType: PDF_MIME });
  check("21st material: 409 MATERIAL_LIMIT_REACHED", twentyFirst.status === 409 && twentyFirst.body.error?.code === "MATERIAL_LIMIT_REACHED", `${twentyFirst.status}`);

  // --- Database constraint ------------------------------------------------------
  const [hashed] = await db.select().from(materials).where(eq(materials.id, pdfId));
  let duplicateRejected = false;
  try {
    const id = randomUUID();
    await db.insert(materials).values({ id, spaceId: spaceA.id, originalName: "dup.pdf", blobPath: `materials/${id}.pdf`, fileHash: hashed.fileHash });
  } catch {
    duplicateRejected = true;
  }
  check("Database rejects a duplicate (space_id, file_hash) insert", duplicateRejected);

  // --- Deleted Study Space --------------------------------------------------------
  await db.update(studySpaces).set({ deletedAt: new Date() }).where(eq(studySpaces.id, spaceA.id));
  const inDeletedSpace = await download(userA.cookie, pdfId);
  check("Material in a deleted Study Space: identical 404", inDeletedSpace.status === 404 && (await inDeletedSpace.text()) === NOT_FOUND_BODY);
}

main()
  .catch((error: unknown) => check("check:materials crashed", false, safeMessage(error)))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.message ? `: ${r.message}` : ""}`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  });
