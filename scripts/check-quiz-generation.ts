#!/usr/bin/env tsx
/**
 * Verifies T-11b: the Sets API and the `generate_quiz` job (retrieve, write,
 * top-up, publish, generation slots, the daily limit), against the dev
 * database with `AI_PROVIDER=fake`. Materials, chunks and topics are
 * seeded directly (T-08a/b's checks cover how they get there); job steps
 * are delivered in-process by a fake publisher.
 *
 * Run with: pnpm run check:quiz-generation
 */
import { config } from "dotenv";
process.env.AI_PROVIDER = "fake";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { aiCalls, chunks, itemSources, jobs, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "../src/server/db/schema";
import { setPublisherForChecks, type PublishOptions, type StepMessage } from "../src/server/jobs/jobs-client";
import { runJobStep } from "../src/server/jobs/jobs-runner";
import { embedTexts, embeddingModelName } from "../src/server/ai/ai-embeddings";
import { normalizeTopicName } from "../src/server/ai/prompts/topics";
import { safeTimeZone } from "../src/features/quizzes/server";
import type { SetDetailResponse, SetResponse } from "../src/features/quizzes/quizzes-schemas";
import { GET as listRoute, POST as createRoute } from "../src/app/api/spaces/[spaceId]/sets/route";
import { DELETE as deleteRoute, GET as getRoute } from "../src/app/api/sets/[id]/route";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];
const BASE = "http://localhost:3000";

function check(name: string, ok: boolean, message = "") {
  results.push({ name, ok, message });
}
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return raw.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 600);
}

type Session = { userId: string; cookie: string };
function req(path: string, session: Session | null, method = "GET", body?: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (session) headers.set("cookie", session.cookie);
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

const queue: { message: StepMessage; options: PublishOptions }[] = [];
async function drain(limit = 50) {
  let delivered = 0;
  while (queue.length && delivered < limit) {
    const outcome = await runJobStep(queue.shift()!.message);
    if (outcome === "retry") throw new Error("A step asked for a retry.");
    delivered++;
  }
}

async function main() {
  setPublisherForChecks(async (message, options) => {
    queue.push({ message, options });
  });

  check("Time zone: unknown zone falls back to UTC", safeTimeZone("Not/AZone") === "UTC" && safeTimeZone("Asia/Dhaka") === "Asia/Dhaka");

  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  for (const label of ["a", "b"]) {
    const saved = await test.saveUser(test.createUser({ email: `check-quiz-${label}-${stamp}@example.com`, name: `Check Quiz ${label}`, role: "student" }));
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
    const ids = sessions.map((s) => s.userId);
    const jobRows = await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.userId, ids));
    if (jobRows.length) {
      await db.delete(aiCalls).where(inArray(aiCalls.jobId, jobRows.map((j) => j.id)));
      await db.delete(jobs).where(inArray(jobs.id, jobRows.map((j) => j.id)));
    }
    for (const s of sessions) await test.deleteUser(s.userId);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

const SUBJECTS = ["primary keys", "foreign keys", "normal forms", "joins", "indexes", "transactions"];

async function seedMaterial(spaceId: string, status: string, paragraphs: string[]) {
  const id = randomUUID();
  await db.insert(materials).values({ id, spaceId, originalName: `${id}.txt`, blobPath: `check/${id}.txt`, status });
  const { vectors } = await embedTexts(paragraphs, "RETRIEVAL_DOCUMENT");
  await db.insert(chunks).values(
    paragraphs.map((content, i) => ({
      materialId: id,
      spaceId,
      chunkIndex: i,
      content,
      pageStart: i + 1,
      pageEnd: i + 1,
      embedding: vectors[i],
      embeddingModel: embeddingModelName(),
    })),
  );
  return id;
}

async function seedTopic(spaceId: string, materialId: string, name: string, pages: number[]) {
  const [t] = await db
    .insert(topics)
    .values({ spaceId, name, normalizedName: normalizeTopicName(name), description: `About ${name}`, status: "confirmed", origin: "ai" })
    .returning();
  await db.insert(materialTopics).values({ spaceId, materialId, topicId: t.id, pages });
  return t.id;
}

async function e2e(a: Session, b: Session) {
  const stamp = Date.now();
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Quiz check" }).returning();
  const paragraphs = Array.from({ length: 30 }, (_, i) => {
    const s = SUBJECTS[i % SUBJECTS.length];
    return `${s} section ${i}. ` + `This paragraph teaches ${s} in relational databases with worked examples. `.repeat(8);
  });
  const material = await seedMaterial(space.id, "ready", paragraphs);
  const topicIds: string[] = [];
  for (const [i, s] of SUBJECTS.entries()) topicIds.push(await seedTopic(space.id, material, s, [i + 1]));
  const notReady = await seedMaterial(space.id, "review_topics", ["unrelated text about trees"]);
  const thinMaterial = await seedMaterial(space.id, "ready", ["Only one short chunk about recursion and base cases."]);
  const thinTopic = await seedTopic(space.id, thinMaterial, "recursion", [1]);

  const create = (s: Session, body: unknown, spaceId = space.id) => createRoute(req(`/api/spaces/${spaceId}/sets`, s, "POST", body), p({ spaceId }));
  const errorCode = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

  // --- Validation ------------------------------------------------------------------
  let res = await create(a, { kind: "quiz", materialIds: [material, notReady], topicIds: topicIds.slice(0, 1), count: 5 });
  check("Create: a material that isn't ready → 400 MATERIAL_NOT_READY", res.status === 400 && (await errorCode(res)) === "MATERIAL_NOT_READY");
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: [thinTopic], count: 5 });
  check("Create: a topic not in the chosen materials → 400 TOPIC_NOT_IN_MATERIALS", res.status === 400 && (await errorCode(res)) === "TOPIC_NOT_IN_MATERIALS");
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds, count: 5 });
  check("Create: 6 topics for 5 questions → 400 TOO_MANY_TOPICS", res.status === 400 && (await errorCode(res)) === "TOO_MANY_TOPICS");
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: topicIds.slice(0, 1), count: 7 });
  check("Create: a count other than 5/10/15/20 → 400", res.status === 400);
  res = await create(a, { kind: "deck", materialIds: [material], topicIds: topicIds.slice(0, 1), count: 5 });
  check("Create: decks aren't available yet → 400", res.status === 400);
  res = await create(b, { kind: "quiz", materialIds: [material], topicIds: topicIds.slice(0, 1), count: 5 });
  check("Create: someone else's space → 404", res.status === 404);
  res = await createRoute(req(`/api/spaces/${space.id}/sets`, null, "POST", {}), p({ spaceId: space.id }));
  check("Create: signed out → 401", res.status === 401);
  check("No sets or jobs were created by rejected requests", (await db.select({ n: count() }).from(studySets).where(eq(studySets.spaceId, space.id)))[0].n === 0 && queue.length === 0);

  // --- Happy path ---------------------------------------------------------------------
  const chosen = topicIds.slice(0, 3);
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: chosen, count: 10 });
  const created = ((await res.json()) as { set: SetResponse }).set;
  check("Create: 202 with status generating and a title from topic names", res.status === 202 && created.status === "generating" && created.title.startsWith("primary keys"), created?.title);
  check("Create: retrieve step published on the generation flow", queue[0]?.message.step === "retrieve" && queue[0]?.options.flow === "generation");
  const job = (await db.select().from(jobs).where(eq(jobs.targetId, created.id)))[0];
  check("Job row: generate_quiz, idempotency key per set", job?.kind === "generate_quiz" && job.idempotencyKey === `generate_quiz:${created.id}`);

  // Generation slots: two other generations hold one, so this one waits.
  const holders = await db
    .insert(jobs)
    .values([0, 1].map((i) => ({ userId: b.userId, kind: "generate_quiz", step: "write:0", status: "running", generationSlotAcquired: true, idempotencyKey: `check-slot-${stamp}-${i}` })))
    .returning({ id: jobs.id });
  await runJobStep(queue.shift()!.message);
  const waiting = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
  check(
    "Slots: with two generations running, the job waits (queued, no slot, attempt not used) and re-publishes in 30 s",
    waiting.status === "queued" && !waiting.generationSlotAcquired && waiting.attemptCount === 0 && waiting.step === "retrieve" && queue[0]?.options.delaySeconds === 30,
    `${waiting.status} ${waiting.attemptCount} ${JSON.stringify(queue[0]?.options)}`,
  );
  await db.delete(jobs).where(inArray(jobs.id, holders.map((h) => h.id)));

  await runJobStep(queue.shift()!.message); // retrieve, admitted
  const planned = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
  const plan = planned.payload as { groups: { topics: { topicId: string; chunkIds: string[]; count: number }[] }[] };
  check("Slots: admitted job holds a slot", planned.generationSlotAcquired && planned.step === "write:0");
  check(
    "Retrieve: plan has ids and counts only, 4/3/3 spread, ≤8 chunks per topic",
    plan.groups.length === 1 &&
      plan.groups[0].topics.map((t) => t.count).join("/") === "4/3/3" &&
      plan.groups[0].topics.every((t) => t.chunkIds.length >= 2 && t.chunkIds.length <= 8),
    JSON.stringify(plan.groups[0]?.topics.map((t) => [t.count, t.chunkIds.length])),
  );
  const planChunks = await db.select({ materialId: chunks.materialId }).from(chunks).where(inArray(chunks.id, plan.groups[0].topics.flatMap((t) => t.chunkIds)));
  check("Retrieve: chunks only from the chosen materials", planChunks.every((c) => c.materialId === material));

  const [{ generating }] = await db.select({ generating: count() }).from(learningItems).where(eq(learningItems.setId, created.id));
  res = await getRoute(req(`/api/sets/${created.id}`, a), p({ id: created.id }));
  const whileGenerating = (await res.json()) as SetDetailResponse;
  check("GET while generating: status generating, no items", whileGenerating.set.status === "generating" && whileGenerating.items.length === 0 && generating === 0);

  await drain();
  const ready = (await db.select().from(studySets).where(eq(studySets.id, created.id)))[0];
  const doneJob = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
  check("Publish: set ready with 10 questions", ready.status === "ready" && ready.generatedCount === 10, `${ready.status} ${ready.generatedCount}`);
  check("Job succeeded and released its slot", doneJob.status === "succeeded" && !doneJob.generationSlotAcquired && doneJob.finishedAt !== null);
  const items = await db.select().from(learningItems).where(eq(learningItems.setId, created.id));
  const perTopic = chosen.map((t) => items.filter((i) => i.topicId === t).length).join("/");
  check("Items: spread 4/3/3 over the chosen topics", perTopic === "4/3/3", perTopic);
  check("Items: distinct normalised prompts, positions 0–9", new Set(items.map((i) => i.normalizedPrompt)).size === 10 && items.map((i) => i.position).sort((x, y) => x - y).join() === "0,1,2,3,4,5,6,7,8,9");
  const sources = await db.select().from(itemSources).where(inArray(itemSources.itemId, items.map((i) => i.id)));
  check("Items: every question cites at least one chunk", items.every((i) => sources.some((s) => s.itemId === i.id)));
  const correctText = items.map((i) => i.options![i.correctIndex!]);
  check("Items: options shuffled but the correct answer kept", correctText.every((t, i) => !t.startsWith("Not ") && items[i].options!.includes(t)) && new Set(items.map((i) => i.correctIndex)).size > 1);
  const calls = await db.select().from(aiCalls).where(eq(aiCalls.jobId, job.id));
  check(
    "ai_calls: query embedding, write and answer check logged with prompt versions",
    calls.some((c) => c.purpose === "embed_query") && calls.some((c) => c.purpose === "write_questions" && c.promptVersion === "quiz-v1") && calls.some((c) => c.purpose === "check_answers" && c.promptVersion === "check-v1"),
  );

  res = await getRoute(req(`/api/sets/${created.id}`, a), p({ id: created.id }));
  const detail = (await res.json()) as SetDetailResponse;
  const raw = JSON.stringify(detail);
  check("GET ready: 10 items in order", res.status === 200 && detail.items.length === 10 && detail.items[0].position === 0);
  check("GET ready: no correct answer, explanation or sources sent", !raw.includes("correctIndex") && !raw.includes("explanation") && !raw.includes("sources"));
  res = await getRoute(req(`/api/sets/${created.id}`, b), p({ id: created.id }));
  check("GET: someone else's set → 404 SET_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "SET_NOT_FOUND");
  res = await getRoute(req(`/api/sets/not-a-uuid`, a), p({ id: "not-a-uuid" }));
  check("GET: malformed id → 404", res.status === 404);

  // --- A second quiz on the same topics: duplicates rejected, top-up fills the gap ---
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: chosen, count: 5 });
  const second = ((await res.json()) as { set: SetResponse }).set;
  await drain();
  const secondItems = await db.select().from(learningItems).where(eq(learningItems.setId, second.id));
  const firstPrompts = new Set(items.map((i) => i.normalizedPrompt));
  const secondSet = (await db.select().from(studySets).where(eq(studySets.id, second.id)))[0];
  check(
    "Duplicates: questions already published for the topics are rejected; the top-up round writes new ones",
    secondSet.status === "ready" && secondItems.length === 5 && secondItems.every((i) => !firstPrompts.has(i.normalizedPrompt)),
    `${secondSet.status} ${secondItems.length}`,
  );

  // --- Thin topic: one chunk → at most 3 questions → fewer than 5 → failed ----------
  res = await create(a, { kind: "quiz", materialIds: [thinMaterial], topicIds: [thinTopic], count: 5 });
  const thin = ((await res.json()) as { set: SetResponse }).set;
  await drain();
  const thinJob = (await db.select().from(jobs).where(eq(jobs.targetId, thin.id)))[0];
  const thinPlan = thinJob.payload as { groups: { topics: { count: number }[] }[] };
  res = await getRoute(req(`/api/sets/${thin.id}`, a), p({ id: thin.id }));
  const thinDetail = (await res.json()) as SetDetailResponse;
  check("Thin topic: a topic with one chunk is capped at 3 questions", thinPlan.groups[0]?.topics[0]?.count === 3, JSON.stringify(thinPlan));
  check(
    "Too few questions: set failed with TOO_FEW_QUESTIONS and its message, no items kept, slot released",
    thinDetail.set.status === "failed" && thinDetail.set.error?.code === "TOO_FEW_QUESTIONS" && thinDetail.items.length === 0 &&
      (await db.select({ n: count() }).from(learningItems).where(eq(learningItems.setId, thin.id)))[0].n === 0 &&
      !thinJob.generationSlotAcquired && thinJob.status === "failed",
  );

  // --- List and delete -----------------------------------------------------------------
  res = await listRoute(req(`/api/spaces/${space.id}/sets?kind=quiz`, a), p({ spaceId: space.id }));
  const listed = ((await res.json()) as { sets: SetResponse[] }).sets;
  check("List: newest first", listed.length === 3 && listed[0].id === thin.id && listed[2].id === created.id);
  res = await deleteRoute(req(`/api/sets/${created.id}`, b, "DELETE"), p({ id: created.id }));
  check("Delete: someone else's set → 404", res.status === 404);
  res = await deleteRoute(req(`/api/sets/${created.id}`, a, "DELETE"), p({ id: created.id }));
  const gone = (await db.select({ n: count() }).from(learningItems).where(eq(learningItems.setId, created.id)))[0].n;
  check("Delete: 204, items and sources go with the set", res.status === 204 && gone === 0);
  res = await getRoute(req(`/api/sets/${created.id}`, a), p({ id: created.id }));
  check("Delete: then GET → 404", res.status === 404);

  // A job whose set was deleted mid-generation just stops.
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: chosen, count: 5 });
  const orphan = ((await res.json()) as { set: SetResponse }).set;
  await db.delete(studySets).where(eq(studySets.id, orphan.id));
  await drain();
  const orphanJob = (await db.select().from(jobs).where(eq(jobs.targetId, orphan.id)))[0];
  check("Deleted mid-generation: the job stops (failed, SET_GONE)", orphanJob.status === "failed" && orphanJob.errorCode === "SET_GONE");

  // --- Daily limit -------------------------------------------------------------------------
  const [spaceB] = await db.insert(studySpaces).values({ ownerId: b.userId, name: "Limit check" }).returning();
  const materialB = await seedMaterial(spaceB.id, "ready", paragraphs.slice(0, 6));
  const topicB = await seedTopic(spaceB.id, materialB, "joins", [1]);
  await db.insert(jobs).values(
    Array.from({ length: 20 }, (_, i) => ({ userId: b.userId, kind: "generate_quiz", step: "publish", status: "succeeded", idempotencyKey: `check-limit-${stamp}-${i}` })),
  );
  res = await create(b, { kind: "quiz", materialIds: [materialB], topicIds: [topicB], count: 5 }, spaceB.id);
  check("Daily limit: the 21st generation today → 429 DAILY_LIMIT_REACHED", res.status === 429 && (await errorCode(res)) === "DAILY_LIMIT_REACHED");
  check(
    "Daily limit: no set was created",
    (await db.select({ n: count() }).from(studySets).where(and(eq(studySets.spaceId, spaceB.id))))[0].n === 0,
  );
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
