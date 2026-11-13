#!/usr/bin/env tsx
/**
 * Verifies T-08b: embeddings, topic suggestions, the topic draft and
 * confirmation, the Topics API and retrieval, end to end against the dev
 * database and dev Blob store, with `AI_PROVIDER=fake` (PRD Section 3:
 * tests never spend Gemini quota). Job steps are delivered in-process by a
 * fake publisher, as in `check-processing.ts`.
 *
 * Run with: pnpm run check:topics
 */
import { config } from "dotenv";
process.env.AI_PROVIDER = "fake";
config({ path: ".env.local" });

import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { put } from "@vercel/blob/client";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { aiCalls, chunks, jobs, materials, studySpaces, topics } from "../src/server/db/schema";
import { setPublisherForChecks, type StepMessage } from "../src/server/jobs/jobs-client";
import { runJobStep } from "../src/server/jobs/jobs-runner";
import { blobExists, deleteBlob } from "../src/server/storage/storage-client";
import { AIUnusableError, callAI } from "../src/server/ai/call-ai";
import { embedTexts } from "../src/server/ai/ai-embeddings";
import { searchChunks } from "../src/features/materials/server";
import type { CreateMaterialResponse, MaterialResponse } from "../src/features/materials/materials-schemas";
import type { TopicDraftResponse, TopicResponse } from "../src/features/topics/topics-schemas";
import { POST as createMaterialRoute } from "../src/app/api/spaces/[spaceId]/materials/route";
import { DELETE as deleteMaterialRoute } from "../src/app/api/materials/[id]/route";
import { POST as completeRoute } from "../src/app/api/materials/[id]/complete/route";
import { GET as topicsListRoute, POST as topicsCreateRoute } from "../src/app/api/spaces/[spaceId]/topics/route";
import { GET as draftGetRoute, PUT as draftPutRoute } from "../src/app/api/materials/[id]/topic-draft/route";
import { POST as confirmRoute } from "../src/app/api/materials/[id]/topic-draft/confirm/route";
import { PATCH as topicPatchRoute } from "../src/app/api/topics/[id]/route";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];
const uploadedPaths = new Set<string>();
const jobIds = new Set<string>();
const BASE = "http://localhost:3000";

function check(name: string, ok: boolean, message = "") {
  results.push({ name, ok, message });
}
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return raw.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 400);
}

type Session = { userId: string; cookie: string };
function req(path: string, session: Session | null, method = "GET", body?: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (session) headers.set("cookie", session.cookie);
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

const queue: StepMessage[] = [];

/** Delivers queued steps in order until none are left (the fake QStash). */
async function drain(limit = 50) {
  let delivered = 0;
  while (queue.length && delivered < limit) {
    const outcome = await runJobStep(queue.shift()!);
    if (outcome === "retry") throw new Error("A step asked for a retry.");
    delivered++;
  }
  return delivered;
}

async function main() {
  setPublisherForChecks(async (m) => {
    queue.push(m);
    jobIds.add(m.jobId);
  });

  // --- callAI: an unusable answer is retried once, then fails ----------------
  let calls = 0;
  const unusable = await callAI({
    jobId: null,
    purpose: "check_script",
    promptVersion: "check-v1",
    model: "generate",
    schema: z.object({ n: z.number() }),
    system: "x",
    prompt: "x",
    validate: (v) => (v.n > 0 ? null : "n must be positive"),
    fake: () => ({ n: calls++ }),
  }).catch((e) => e);
  check("callAI: retries an answer that fails the domain check once, then returns it", unusable?.n === 1 && calls === 2);
  const failed = await callAI({
    jobId: null,
    purpose: "check_script",
    promptVersion: "check-v1",
    model: "generate",
    schema: z.object({ n: z.number() }),
    system: "x",
    prompt: "x",
    fake: () => ({ n: "not a number" }) as unknown as { n: number },
  }).catch((e) => e);
  check("callAI: two unusable answers throw AIUnusableError", failed instanceof AIUnusableError);
  const logged = await db.select().from(aiCalls).where(eq(aiCalls.purpose, "check_script"));
  check(
    "ai_calls: one row per attempt, with status, model and prompt version, no prompt text",
    logged.length === 4 && logged.filter((r) => r.status === "ok").length === 1 && logged.every((r) => r.model === "fake" && r.promptVersion === "check-v1"),
    `${logged.length}`,
  );
  await db.delete(aiCalls).where(eq(aiCalls.purpose, "check_script"));

  const { vectors } = await embedTexts(["primary keys"], "RETRIEVAL_QUERY");
  check("Fake embeddings: 768-D unit vectors", vectors[0].length === 768 && Math.abs(Math.hypot(...vectors[0]) - 1) < 1e-9);

  // --- Users ---------------------------------------------------------------------
  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  for (const label of ["a", "b"]) {
    const saved = await test.saveUser(test.createUser({ email: `check-topics-${label}-${stamp}@example.com`, name: `Check Topics ${label}`, role: "student" }));
    const { headers } = await test.login({ userId: saved.id });
    sessions.push({ userId: saved.id, cookie: headers.get("cookie") ?? "" });
  }
  const [a, b] = sessions;

  try {
    await e2e(a, b);
  } catch (error) {
    check("End-to-end run completed", false, safeMessage(error));
  } finally {
    setPublisherForChecks(undefined);
    if (uploadedPaths.size) await deleteBlob([...uploadedPaths]).catch(() => undefined);
    const leftover = (await Promise.all([...uploadedPaths].map(blobExists))).some(Boolean);
    if (jobIds.size) {
      await db.delete(aiCalls).where(inArray(aiCalls.jobId, [...jobIds]));
      await db.delete(jobs).where(inArray(jobs.id, [...jobIds]));
    }
    for (const s of sessions) await test.deleteUser(s.userId);
    check("Cleanup: blobs, users, jobs and ai_calls removed", !leftover);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

async function upload(session: Session, spaceId: string, name: string, text: string) {
  const bytes = Buffer.from(text);
  const created = await createMaterialRoute(req(`/api/spaces/${spaceId}/materials`, session, "POST", { name, size: bytes.length, contentType: "text/plain" }), p({ spaceId }));
  const { material, upload: u } = (await created.json()) as CreateMaterialResponse;
  await put(u.pathname, bytes, { access: "private", token: u.clientToken, contentType: "text/plain" });
  uploadedPaths.add(u.pathname);
  await completeRoute(req(`/api/materials/${material.id}/complete`, session, "POST"), p({ id: material.id }));
  return material.id;
}

async function e2e(a: Session, b: Session) {
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Topics check" }).returning();
  const materialRow = async (id: string) => (await db.select().from(materials).where(eq(materials.id, id)))[0];

  // 60 paragraphs of ~1,600 characters: 60 chunks, so embedding takes two steps.
  const subjects = ["primary keys", "foreign keys", "normal forms", "joins", "indexes", "transactions"];
  const paragraphs = Array.from({ length: 60 }, (_, i) => {
    const s = subjects[i % subjects.length];
    return `${s} section ${i}. ` + `This paragraph teaches ${s} in relational databases with worked examples. `.repeat(20);
  });
  const id = await upload(a, space.id, "db-notes.txt", paragraphs.join("\n\n"));

  await runJobStep(queue.shift()!); // extract
  const afterExtract = await materialRow(id);
  check("After extract: stage embed, 0 of 60", afterExtract.stage === "embed" && afterExtract.progressDone === 0 && afterExtract.progressTotal === 60, `${afterExtract.progressDone}/${afterExtract.progressTotal}`);
  await runJobStep(queue.shift()!); // embed batch 1
  const midEmbed = await materialRow(id);
  check("Embedding runs in steps of 50: progress 50 of 60, next step queued", midEmbed.progressDone === 50 && midEmbed.stage === "embed" && queue[0]?.step === "embed");
  await drain();

  const done = await materialRow(id);
  const [{ embedded }] = await db.select({ embedded: count(chunks.embedding) }).from(chunks).where(eq(chunks.materialId, id));
  const sample = (await db.select().from(chunks).where(eq(chunks.materialId, id)).limit(1))[0];
  check("All chunks embedded with the model name stored", embedded === 60 && sample.embeddingModel === "fake-hashed-words" && sample.embedding?.length === 768);
  check("Material: review_topics, progress cleared", done.status === "review_topics" && done.stage === null && done.progressDone === null, done.status);
  const job = (await db.select().from(jobs).where(eq(jobs.targetId, id)))[0];
  check("Job succeeded and finished", job.status === "succeeded" && job.finishedAt !== null);
  const calls = await db.select().from(aiCalls).where(eq(aiCalls.jobId, job.id));
  check(
    "ai_calls logged for embed (2) and suggest_topics (1) with prompt version",
    calls.filter((c) => c.purpose === "embed").length === 2 && calls.some((c) => c.purpose === "suggest_topics" && c.promptVersion === "topics-v1"),
  );

  // --- Retrieval -----------------------------------------------------------------
  const { vectors } = await embedTexts(["foreign keys"], "RETRIEVAL_QUERY");
  const hits = await searchChunks({ spaceId: space.id, materialIds: [id], queryVector: vectors[0], limit: 5 });
  check("Retrieval: closest chunks are about the query", hits.length === 5 && hits[0].content.includes("foreign keys"), hits[0]?.content.slice(0, 40));
  const otherSpace = await searchChunks({ spaceId: crypto.randomUUID(), materialIds: [id], queryVector: vectors[0], limit: 5 });
  check("Retrieval: scoped to the space", otherSpace.length === 0);

  // --- Draft ------------------------------------------------------------------------
  const draftRes = await draftGetRoute(req(`/api/materials/${id}/topic-draft`, a), p({ id }));
  const draft = (await draftRes.json()) as TopicDraftResponse;
  check(
    "Draft: 3 AI-suggested topics with pages",
    draftRes.status === 200 && draft.topics.length === 3 && draft.topics.every((t) => t.origin === "ai" && t.pages.length > 0 && t.existingTopicId === null),
    JSON.stringify(draft).slice(0, 200),
  );
  const listBefore = (await (await topicsListRoute(req(`/api/spaces/${space.id}/topics`, a), p({ spaceId: space.id }))).json()) as { topics: TopicResponse[] };
  check("Draft topics are not listed as space topics", listBefore.topics.length === 0);
  check("Student B: draft is 404", (await draftGetRoute(req(`/api/materials/${id}/topic-draft`, b), p({ id }))).status === 404);

  // A confirmed manual topic with the same name as suggestion 0, but different case and spacing.
  const manualName = draft.topics[0].name.toUpperCase().replace(/ /g, "  ");
  const manual = await topicsCreateRoute(req(`/api/spaces/${space.id}/topics`, a, "POST", { name: manualName }), p({ spaceId: space.id }));
  const manualTopic = ((await manual.json()) as { topic: TopicResponse }).topic;
  check("Manual topic: 201, confirmed, origin manual", manual.status === 201 && manualTopic.status === "confirmed" && manualTopic.origin === "manual");
  const dupe = await topicsCreateRoute(req(`/api/spaces/${space.id}/topics`, a, "POST", { name: draft.topics[0].name.toLowerCase() }), p({ spaceId: space.id }));
  check("Same name ignoring case and spaces: 409 TOPIC_EXISTS", dupe.status === 409);
  check("Student B can't add topics to A's space: 404", (await topicsCreateRoute(req(`/api/spaces/${space.id}/topics`, b, "POST", { name: "x" }), p({ spaceId: space.id }))).status === 404);

  const linked = (await (await draftGetRoute(req(`/api/materials/${id}/topic-draft`, a), p({ id }))).json()) as TopicDraftResponse;
  check("Draft marks the matching suggestion 'will be linked'", linked.topics[0].existingTopicId === manualTopic.id);

  // Save & exit: rename one, remove one, add one.
  const saved = await draftPutRoute(
    req(`/api/materials/${id}/topic-draft`, a, "PUT", {
      topics: [
        { id: draft.topics[0].id, name: draft.topics[0].name, description: draft.topics[0].description },
        { id: draft.topics[1].id, name: "Renamed topic", description: "Edited." },
        { name: "Added by student" },
      ],
    }),
    p({ id }),
  );
  const savedDraft = (await saved.json()) as TopicDraftResponse;
  check(
    "Save & exit: rename keeps AI origin and pages, removal drops it, addition is manual",
    saved.status === 200 &&
      savedDraft.topics.length === 3 &&
      savedDraft.topics[1].name === "Renamed topic" &&
      savedDraft.topics[1].origin === "ai" &&
      savedDraft.topics[1].pages.length > 0 &&
      savedDraft.topics[2].origin === "manual" &&
      !savedDraft.topics.some((t) => t.id === draft.topics[2].id),
  );
  check("Draft validation: a 61-character name is 400", (await draftPutRoute(req(`/api/materials/${id}/topic-draft`, a, "PUT", { topics: [{ name: "x".repeat(61) }] }), p({ id }))).status === 400);

  const confirmed = await confirmRoute(req(`/api/materials/${id}/topic-draft/confirm`, a, "POST"), p({ id }));
  const confirmedBody = (await confirmed.json()) as { material: MaterialResponse; topics: TopicResponse[] };
  check("Confirm: material ready, 3 topics confirmed", confirmed.status === 200 && confirmedBody.material.status === "ready" && confirmedBody.topics.length === 3);
  const spaceTopics = await db.select().from(topics).where(and(eq(topics.spaceId, space.id)));
  check(
    "Confirm linked the matching suggestion to the existing topic (no duplicate, no drafts left)",
    spaceTopics.length === 3 && spaceTopics.every((t) => t.status === "confirmed") && confirmedBody.topics.some((t) => t.id === manualTopic.id),
    `${spaceTopics.length}`,
  );
  check("Confirm twice: 409 INVALID_MATERIAL_STATE", (await confirmRoute(req(`/api/materials/${id}/topic-draft/confirm`, a, "POST"), p({ id }))).status === 409);

  // --- PATCH ------------------------------------------------------------------------
  const renamed = await topicPatchRoute(req(`/api/topics/${manualTopic.id}`, a, "PATCH", { name: "Keys" }), p({ id: manualTopic.id }));
  check("Rename: 200, same id", renamed.status === 200 && ((await renamed.json()) as { topic: TopicResponse }).topic.id === manualTopic.id);
  const clash = await topicPatchRoute(req(`/api/topics/${manualTopic.id}`, a, "PATCH", { name: "renamed TOPIC" }), p({ id: manualTopic.id }));
  check("Rename onto another confirmed topic's name: 409", clash.status === 409);
  const archived = await topicPatchRoute(req(`/api/topics/${manualTopic.id}`, a, "PATCH", { status: "archived" }), p({ id: manualTopic.id }));
  const list = (await (await topicsListRoute(req(`/api/spaces/${space.id}/topics`, a), p({ spaceId: space.id }))).json()) as { topics: TopicResponse[] };
  const withArchived = (await (await topicsListRoute(req(`/api/spaces/${space.id}/topics?include=archived`, a), p({ spaceId: space.id }))).json()) as { topics: TopicResponse[] };
  check("Archive: hidden from the list, shown with include=archived", archived.status === 200 && list.topics.length === 2 && withArchived.topics.length === 3);
  check("Student B: PATCH is 404", (await topicPatchRoute(req(`/api/topics/${manualTopic.id}`, b, "PATCH", { name: "Mine" }), p({ id: manualTopic.id }))).status === 404);

  // --- Deleting a material in review removes its draft topics -------------------------
  const second = await upload(a, space.id, "short.txt", paragraphs.slice(0, 3).join("\n\n").replace(/section/g, "part"));
  await drain();
  const draftIds = ((await (await draftGetRoute(req(`/api/materials/${second}/topic-draft`, a), p({ id: second }))).json()) as TopicDraftResponse).topics.map((t) => t.id);
  await deleteMaterialRoute(req(`/api/materials/${second}`, a, "DELETE"), p({ id: second }));
  const leftDrafts = draftIds.length ? await db.select().from(topics).where(inArray(topics.id, draftIds)) : [];
  check("Deleting a material in review deletes its draft topics", draftIds.length === 3 && leftDrafts.length === 0);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
