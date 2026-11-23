#!/usr/bin/env tsx
/**
 * Verifies T-11b: the Sets API and the `generate_quiz` job (retrieve, write,
 * top-up, publish, generation slots, the daily limit), against the dev
 * database with `AI_PROVIDER=fake`. Materials, chunks and topics are
 * seeded directly (T-08a/b's checks cover how they get there); job steps
 * are delivered in-process by a fake publisher.
 *
 * T-18 adds the `generate_deck` runs (recall, short answer and mix, the code
 * and support checks, "N of M generated", NO_CARDS, thin topics, the combined
 * daily limit, the deck list and delete); the quiz runs are unchanged.
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
import { aiCalls, chunks, deckSessions, itemSources, jobs, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "../src/server/db/schema";
import { setPublisherForChecks, type PublishOptions, type StepMessage } from "../src/server/jobs/jobs-client";
import { runJobStep } from "../src/server/jobs/jobs-runner";
import { embedTexts, embeddingModelName } from "../src/server/ai/ai-embeddings";
import { normalizeTopicName } from "../src/server/ai/prompts/topics";
import { fakeCards, setFakeCardsForChecks, type WrittenCard } from "../src/server/ai/prompts/cards";
import { safeTimeZone } from "../src/lib/time-zone";
import type { SetDetailResponse, SetResponse } from "../src/features/quizzes/quizzes-schemas";
import type { DeckListItemResponse } from "../src/features/flashcards/flashcards-schemas";
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
  check("Create: a deck without a card style → 400", res.status === 400);
  res = await create(b, { kind: "quiz", materialIds: [material], topicIds: topicIds.slice(0, 1), count: 5 });
  check("Create: someone else's space → 404", res.status === 404);
  res = await createRoute(req(`/api/spaces/${space.id}/sets`, null, "POST", {}), p({ spaceId: space.id }));
  check("Create: signed out → 401", res.status === 401);
  check("No sets or jobs were created by rejected requests", (await db.select({ n: count() }).from(studySets).where(eq(studySets.spaceId, space.id)))[0].n === 0 && queue.length === 0);

  // --- Happy path ---------------------------------------------------------------------
  const chosen = topicIds.slice(0, 3);
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: chosen, count: 10 });
  const created = ((await res.json()) as { set: SetResponse }).set;
  check("Create: 202 with status generating; no name given → \"Quiz 1\" (topics are tags, not the name)", res.status === 202 && created.status === "generating" && created.title === "Quiz 1", created?.title);
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
    calls.some((c) => c.purpose === "embed_query") && calls.some((c) => c.purpose === "write_questions" && c.promptVersion === "quiz-v2") && calls.some((c) => c.purpose === "check_answers" && c.promptVersion === "check-v1"),
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
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds: chosen, count: 5, title: "  Keys revision  " });
  const second = ((await res.json()) as { set: SetResponse }).set;
  check("Create: the student's own quiz name is kept, trimmed", second.title === "Keys revision", second.title);
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

  // === Decks (T-18) ======================================================================
  const createDeck = (s: Session, over: Record<string, unknown>, spaceId = space.id) =>
    create(s, { kind: "deck", materialIds: [material], topicIds: topicIds.slice(0, 1), cardStyle: "recall", count: 5, ...over }, spaceId);
  const setOf = async (r: Response) => ((await r.json()) as { set: SetResponse }).set;
  const itemsOf = (setId: string) => db.select().from(learningItems).where(eq(learningItems.setId, setId));
  const queueBefore = queue.length;

  res = await createDeck(a, { materialIds: [material, notReady] });
  check("Deck create: a material that isn't ready → 400 MATERIAL_NOT_READY", res.status === 400 && (await errorCode(res)) === "MATERIAL_NOT_READY");
  const [spaceOther] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Other space" }).returning();
  const otherMaterial = await seedMaterial(spaceOther.id, "ready", paragraphs.slice(0, 4));
  res = await createDeck(a, { materialIds: [otherMaterial] });
  check("Deck create: another space's material → 400 MATERIAL_NOT_READY", res.status === 400 && (await errorCode(res)) === "MATERIAL_NOT_READY");
  res = await createDeck(a, { materialIds: [material], topicIds: [thinTopic] });
  check("Deck create: a topic not in the chosen materials → 400 TOPIC_NOT_IN_MATERIALS", res.status === 400 && (await errorCode(res)) === "TOPIC_NOT_IN_MATERIALS");
  res = await createDeck(a, { topicIds: topicIds.slice(0, 3), count: 2 });
  const tooMany = (await res.json()) as { error?: { code?: string; message?: string } };
  check(
    "Deck create: 3 topics for 2 cards → 400 TOO_MANY_TOPICS, message names cards",
    res.status === 400 && tooMany.error?.code === "TOO_MANY_TOPICS" && /cards/.test(tooMany.error.message ?? "") && !/questions/.test(tooMany.error.message ?? ""),
    tooMany.error?.message,
  );
  res = await create(a, { kind: "quiz", materialIds: [material], topicIds, count: 5 });
  const quizMessage = (await res.json()) as { error?: { message?: string } };
  check("Quiz create: the too-many-topics message still names questions", res.status === 400 && /questions/.test(quizMessage.error?.message ?? ""));
  res = await createDeck(a, { count: 0 });
  check("Deck create: count 0 → 400", res.status === 400);
  res = await createDeck(b, {});
  check("Deck create: someone else's space → 404", res.status === 404);
  check(
    "Deck create: rejected requests created no deck or job",
    (await db.select({ n: count() }).from(studySets).where(and(eq(studySets.spaceId, space.id), eq(studySets.kind, "deck"))))[0].n === 0 && queue.length === queueBefore,
  );

  // Recall deck over 3 topics.
  const deckTopics = topicIds.slice(0, 3);
  res = await createDeck(a, { topicIds: deckTopics, cardStyle: "recall", count: 5 });
  const recallDeck = await setOf(res);
  check(
    "Deck create: 202, generating, kind deck, card style recall, retrieve published on the generation flow",
    res.status === 202 && recallDeck.status === "generating" && recallDeck.kind === "deck" && recallDeck.cardStyle === "recall" && queue.at(-1)?.message.step === "retrieve" && queue.at(-1)?.options.flow === "generation",
  );
  const deckJob = (await db.select().from(jobs).where(eq(jobs.targetId, recallDeck.id)))[0];
  check("Deck job row: generate_deck, idempotency key per set", deckJob?.kind === "generate_deck" && deckJob.idempotencyKey === `generate_deck:${recallDeck.id}`);
  await drain();
  const recallRow = (await db.select().from(studySets).where(eq(studySets.id, recallDeck.id)))[0];
  const recallItems = await itemsOf(recallDeck.id);
  check(
    "Recall deck: ready with 5 recall cards (2/2/1 over the topics)",
    recallRow.status === "ready" && recallRow.generatedCount === 5 && recallItems.length === 5 && recallItems.every((i) => i.kind === "recall") && deckTopics.map((t) => recallItems.filter((i) => i.topicId === t).length).join("/") === "2/2/1",
    `${recallRow.status} ${recallRow.generatedCount}`,
  );
  check(
    "Recall deck: front in prompt, back in answer_text, no key points or options, version cards-v1",
    recallItems.every((i) => i.prompt.length > 0 && (i.answerText ?? "").length > 0 && i.keyPoints === null && i.options === null && i.promptVersion === "cards-v1"),
  );
  const recallSources = await db.select().from(itemSources).where(inArray(itemSources.itemId, recallItems.map((i) => i.id)));
  check("Recall deck: every card cites at least one chunk", recallItems.every((i) => recallSources.some((s) => s.itemId === i.id)));
  const recallCalls = await db.select().from(aiCalls).where(eq(aiCalls.jobId, deckJob.id));
  check(
    "Deck ai_calls: write_cards (cards-v1) and check_cards (card-check-v1) logged; no quiz prompts",
    recallCalls.some((c) => c.purpose === "write_cards" && c.promptVersion === "cards-v1") &&
      recallCalls.some((c) => c.purpose === "check_cards" && c.promptVersion === "card-check-v1") &&
      !recallCalls.some((c) => c.purpose === "write_questions"),
  );
  const recallPlan = (await db.select().from(jobs).where(eq(jobs.id, deckJob.id)))[0].payload as { groups: { topics: { count: number; recall?: number }[] }[] };
  check("Deck plan: for a recall deck every card is a recall card", recallPlan.groups[0].topics.every((t) => t.recall === t.count));
  res = await getRoute(req(`/api/sets/${recallDeck.id}`, a), p({ id: recallDeck.id }));
  const deckDetail = (await res.json()) as SetDetailResponse;
  const deckRaw = JSON.stringify(deckDetail);
  const firstCard = [...recallItems].sort((x, y) => x.position - y.position)[0];
  check(
    "GET a deck: card fronts only, in order; no backs, key points or sources",
    res.status === 200 && deckDetail.items.length === 5 && deckDetail.items[0].prompt === firstCard.prompt && !deckRaw.includes(JSON.stringify(firstCard.answerText).slice(1, -1)) && !deckRaw.includes("keyPoints") && !deckRaw.includes("answerText") && !deckRaw.includes("sources") && !deckRaw.includes("correctIndex"),
  );

  // Short-answer deck, one topic.
  res = await createDeck(a, { cardStyle: "short_answer", count: 3 });
  const shortDeck = await setOf(res);
  await drain();
  const shortItems = await itemsOf(shortDeck.id);
  check(
    "Short-answer deck: 3 short-answer cards, each with a model answer and 2–4 key points",
    shortItems.length === 3 && shortItems.every((i) => i.kind === "short_answer" && (i.answerText ?? "") !== "" && Array.isArray(i.keyPoints) && i.keyPoints.length >= 2 && i.keyPoints.length <= 4),
  );

  // Mix: half and half, recall takes the odd one.
  res = await createDeck(a, { cardStyle: "mix", count: 5 });
  const mixOdd = await setOf(res);
  await drain();
  const mixOddItems = await itemsOf(mixOdd.id);
  check("Mix of 5 (one topic): 3 recall and 2 short answer", mixOddItems.filter((i) => i.kind === "recall").length === 3 && mixOddItems.filter((i) => i.kind === "short_answer").length === 2);
  res = await createDeck(a, { cardStyle: "mix", count: 4, topicIds: [...topicIds.slice(3, 6), topicIds[0]] });
  const mixEven = await setOf(res);
  await drain();
  const mixEvenItems = await itemsOf(mixEven.id);
  check("Mix of 4 (four topics): 2 recall and 2 short answer", mixEvenItems.length === 4 && mixEvenItems.filter((i) => i.kind === "recall").length === 2 && mixEvenItems.filter((i) => i.kind === "short_answer").length === 2);

  // A thin topic (one chunk): at most 3 cards, and the deck still publishes ("3 of 5").
  res = await createDeck(a, { materialIds: [thinMaterial], topicIds: [thinTopic], count: 5 });
  const thinDeck = await setOf(res);
  await drain();
  const thinRow = (await db.select().from(studySets).where(eq(studySets.id, thinDeck.id)))[0];
  check("Thin topic deck: capped at 3 cards and published as 3 of 5 (no minimum)", thinRow.status === "ready" && thinRow.generatedCount === 3 && thinRow.requestedCount === 5, `${thinRow.status} ${thinRow.generatedCount}`);

  // Code checks, all at once, through a writer that returns flawed cards.
  const logged: string[] = [];
  const realInfo = console.info;
  console.info = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  let none: SetResponse;
  try {
    setFakeCardsForChecks((topicList, sourceList) => {
      const t = topicList[0].label;
      const s1 = sourceList[0].label;
      const good: WrittenCard = { kind: "recall", front: "What is a good card?", back: "One that is right.", keyPoints: [], topic: t, sources: [s1] };
      const shortCard = (keyPoints: string[], front: string): WrittenCard => ({ kind: "short_answer", front, back: "Model.", keyPoints, topic: t, sources: [s1] });
      return {
        cards: [
          good,
          { ...good, front: "x".repeat(121) },
          { ...good, front: "Back too long?", back: "y".repeat(201) },
          { ...good, front: "Unknown topic?", topic: "T99" },
          { ...good, front: "Unknown source?", sources: ["S99"] },
          { ...good, front: "No sources at all?", sources: [] },
          { ...good, front: "WHAT is a good card" },
          shortCard(["only one"], "One key point?"),
          shortCard(["1", "2", "3", "4", "5"], "Five key points?"),
          { ...good, front: "Recall with key points?", keyPoints: ["a", "b"] },
          { ...good, front: "   ", back: "empty front" },
        ],
      };
    });
    res = await createDeck(a, { count: 10, cardStyle: "mix" });
    const flawed = await setOf(res);
    await drain();
    const flawedRow = (await db.select().from(studySets).where(eq(studySets.id, flawed.id)))[0];
    const flawedItems = await itemsOf(flawed.id);
    check(
      "Code checks: only the one valid card is kept; the set publishes as 1 of 10",
      flawedRow.status === "ready" && flawedRow.generatedCount === 1 && flawedRow.requestedCount === 10 && flawedItems.length === 1 && flawedItems[0].prompt === "What is a good card?",
      `${flawedRow.status} ${flawedRow.generatedCount} ${flawedItems.map((i) => i.prompt).join("|")}`,
    );
    const reasons = logged.filter((l) => l.includes("rejected by code check")).join("\n");
    check(
      "Code checks: lengths, key points, unknown topic and source labels and duplicate fronts are each logged as rejected",
      ["recall card shape (front", "recall card shape (back", "unknown topic label", "unknown source label", "duplicate front", "short_answer card shape (keyPoints", "recall card shape (keyPoints"].every((r) => reasons.includes(r)),
      reasons.slice(0, 600),
    );

    // The support check: a "no" drops the card and logs the reason.
    logged.length = 0;
    let first = true;
    let droppedFront = "";
    setFakeCardsForChecks(undefined, (candidates) => {
      if (first) droppedFront = candidates[0].front;
      const results = candidates.map((c, i) => ({ id: c.id, supported: !(first && i === 0), reason: "not in the sources" }));
      first = false;
      return { results };
    });
    res = await createDeck(a, { count: 4, cardStyle: "recall", topicIds: topicIds.slice(4, 6) });
    const checked = await setOf(res);
    await drain();
    const checkedItems = await itemsOf(checked.id);
    check(
      "Support check: a card judged unsupported is dropped and logged; the top-up round fills the gap",
      droppedFront !== "" && logged.some((l) => l.includes("rejected by answer check (not in the sources)")) && !checkedItems.some((i) => i.prompt === droppedFront) && checkedItems.length === 4,
      `${checkedItems.length}: ${checkedItems.map((i) => i.prompt).join(" | ")}`,
    );

    // Every card rejected → failed with NO_CARDS.
    setFakeCardsForChecks(undefined, (candidates) => ({ results: candidates.map((c) => ({ id: c.id, supported: false, reason: "no" })) }));
    res = await createDeck(a, { count: 5 });
    none = await setOf(res);
    await drain();
    const noneJob = (await db.select().from(jobs).where(eq(jobs.targetId, none.id)))[0];
    res = await getRoute(req(`/api/sets/${none.id}`, a), p({ id: none.id }));
    const noneDetail = (await res.json()) as SetDetailResponse;
    check(
      "Zero passing cards: set failed with NO_CARDS and its message, no cards kept, slot released",
      noneDetail.set.status === "failed" && noneDetail.set.error?.code === "NO_CARDS" && /No good cards could be written/.test(noneDetail.set.error.message) && noneDetail.items.length === 0 && noneJob.status === "failed" && noneJob.errorCode === "NO_CARDS" && !noneJob.generationSlotAcquired,
    );
  } finally {
    setFakeCardsForChecks(undefined);
    console.info = realInfo;
  }
  check(
    "Fake override is off again: the default fake writes valid cards",
    fakeCards([{ label: "T1", name: "n", description: "d", recall: 1, short: 1, sourceLabels: ["S1"] }], [{ label: "S1", pages: "1", content: "some words here" }], 1).cards.length === 2,
  );

  // The lists: decks only, then quizzes only.
  res = await listRoute(req(`/api/spaces/${space.id}/sets?kind=deck`, a), p({ spaceId: space.id }));
  const deckList = ((await res.json()) as { sets: DeckListItemResponse[] }).sets;
  check(
    "List ?kind=deck: decks only, newest first, each with latestSession and practisableCount",
    res.status === 200 && deckList.length > 0 && deckList.every((d) => d.kind === "deck" && d.latestSession.status === "none" && typeof d.practisableCount === "number") && deckList[0].createdAt >= deckList.at(-1)!.createdAt,
  );
  const listedRecall = deckList.find((d) => d.id === recallDeck.id)!;
  const listedNone = deckList.find((d) => d.id === none.id)!;
  check("List ?kind=deck: practisableCount counts active sourced cards (5 for the recall deck, 0 for the failed one)", listedRecall.practisableCount === 5 && listedNone.practisableCount === 0 && listedRecall.cardStyle === "recall");
  res = await listRoute(req(`/api/spaces/${space.id}/sets?kind=quiz`, a), p({ spaceId: space.id }));
  const quizList = ((await res.json()) as { sets: SetResponse[] }).sets;
  check("List ?kind=quiz: quizzes only", quizList.length > 0 && quizList.every((s) => s.kind === "quiz" && s.cardStyle === null));

  // Delete: always allowed for a deck; its sessions go with it.
  await db.insert(deckSessions).values({ spaceId: space.id, setId: recallDeck.id, studentId: a.userId, status: "completed", finishedAt: new Date() });
  await db.insert(deckSessions).values({ spaceId: space.id, setId: recallDeck.id, studentId: a.userId });
  res = await deleteRoute(req(`/api/sets/${recallDeck.id}`, b, "DELETE"), p({ id: recallDeck.id }));
  check("Delete a deck: someone else's → 404", res.status === 404);
  res = await deleteRoute(req(`/api/sets/${recallDeck.id}`, a, "DELETE"), p({ id: recallDeck.id }));
  check(
    "Delete a deck with sessions: 204; cards, sources and sessions go",
    res.status === 204 &&
      (await db.select({ n: count() }).from(deckSessions).where(eq(deckSessions.setId, recallDeck.id)))[0].n === 0 &&
      (await itemsOf(recallDeck.id)).length === 0,
  );

  // --- Daily limit -------------------------------------------------------------------------
  const [spaceB] = await db.insert(studySpaces).values({ ownerId: b.userId, name: "Limit check" }).returning();
  const materialB = await seedMaterial(spaceB.id, "ready", paragraphs.slice(0, 6));
  const topicB = await seedTopic(spaceB.id, materialB, "joins", [1]);
  await db.insert(jobs).values(
    Array.from({ length: 20 }, (_, i) => ({ userId: b.userId, kind: "generate_quiz", step: "publish", status: "succeeded", idempotencyKey: `check-limit-${stamp}-${i}` })),
  );
  res = await create(b, { kind: "quiz", materialIds: [materialB], topicIds: [topicB], count: 5 }, spaceB.id);
  check("Daily limit: the 21st generation today → 429 DAILY_LIMIT_REACHED", res.status === 429 && (await errorCode(res)) === "DAILY_LIMIT_REACHED");
  res = await create(b, { kind: "deck", materialIds: [materialB], topicIds: [topicB], cardStyle: "recall", count: 5 }, spaceB.id);
  check("Daily limit: quizzes and decks share it (the 21st today is a deck) → 429", res.status === 429 && (await errorCode(res)) === "DAILY_LIMIT_REACHED");
  check(
    "Daily limit: no set was created",
    (await db.select({ n: count() }).from(studySets).where(and(eq(studySets.spaceId, spaceB.id))))[0].n === 0,
  );
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
