#!/usr/bin/env tsx
/**
 * Verifies T-14 and T-15: attempts and server scoring, mastery, and the
 * mistakes list (no revision schedule), end to end through the route
 * handlers against the dev database. Quizzes are seeded directly (T-11b's
 * check covers generation).
 *
 * Run with: pnpm run check:attempts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import {
  attemptItems,
  attempts,
  chunks,
  itemSources,
  learningItems,
  materials,
  materialTopics,
  revisionEvents,
  revisionItems,
  studySets,
  studySpaces,
  topics,
} from "../src/server/db/schema";
import { normalizePrompt } from "../src/features/quizzes/quizzes-schemas";
import { masteryFrom, type SpaceProgress, type TopicMasteryDetail } from "../src/features/progress/progress-schemas";
import { MISTAKES_SESSION_SIZE, type CheckResult as MistakeCheckResult, type MistakesResponse } from "../src/features/revision/revision-schemas";
import type { AttemptResponse } from "../src/features/attempts/attempts-schemas";
import type { SetListItemResponse } from "../src/features/quizzes/quizzes-schemas";
import { POST as startRoute } from "../src/app/api/sets/[id]/attempts/route";
import { GET as attemptRoute } from "../src/app/api/attempts/[id]/route";
import { PATCH as answerRoute } from "../src/app/api/attempts/[id]/answers/route";
import { POST as submitRoute } from "../src/app/api/attempts/[id]/submit/route";
import { GET as allProgressRoute } from "../src/app/api/progress/route";
import { GET as spaceProgressRoute } from "../src/app/api/spaces/[spaceId]/progress/route";
import { GET as masteryRoute } from "../src/app/api/topics/[id]/mastery/route";
import { GET as mistakesRoute } from "../src/app/api/revision/mistakes/route";
import { POST as checkRoute } from "../src/app/api/revision/items/[id]/check/route";
import { DELETE as deleteSetRoute } from "../src/app/api/sets/[id]/route";
import { GET as setsListRoute } from "../src/app/api/spaces/[spaceId]/sets/route";

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
const errorCode = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;
const noAnswers = (json: unknown) => {
  const raw = JSON.stringify(json);
  return !raw.includes("correctIndex") && !raw.includes("explanation") && !raw.includes("sources") && !raw.includes("isCorrect");
};

async function main() {
  // --- Pure rules at their boundaries --------------------------------------------
  const m = (n: number, c: number) => masteryFrom(n, c);
  check("Mastery: 0 questions = not assessed", m(0, 0).status === "not_assessed");
  check("Mastery: 4 questions = insufficient, 1 more needed, no percentage", m(4, 4).status === "insufficient" && m(4, 4).needed === 1 && m(4, 4).percent === null);
  check("Mastery: 5 with 2 correct = 40%, weak", m(5, 2).status === "weak" && m(5, 2).percent === 40);
  check("Mastery: 6 of 10 = 60%, on track (60 is not weak)", m(10, 6).status === "on_track" && m(10, 6).percent === 60);
  check("Mastery: 5 of 9 = 56%, weak", m(9, 5).status === "weak");

  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  for (const label of ["a", "b"]) {
    const saved = await test.saveUser(test.createUser({ email: `check-attempts-${label}-${stamp}@example.com`, name: `Check Attempts ${label}`, role: "student" }));
    const { headers } = await test.login({ userId: saved.id });
    sessions.push({ userId: saved.id, cookie: headers.get("cookie") ?? "" });
  }
  const [a, b] = sessions;

  try {
    await e2e(a, b);
  } catch (error) {
    check("End-to-end run completed", false, safeMessage(error));
  } finally {
    for (const s of sessions) await test.deleteUser(s.userId);
    const [{ left }] = await db
      .select({ left: count() })
      .from(attempts)
      .where(inArray(attempts.studentId, sessions.map((s) => s.userId)));
    const [{ reviews }] = await db
      .select({ reviews: count() })
      .from(revisionItems)
      .where(inArray(revisionItems.studentId, sessions.map((s) => s.userId)));
    check("Deleting a user deletes their attempts and mistakes (no FK blocks it)", left === 0 && reviews === 0);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

async function seedSet(spaceId: string, chunkIds: string[], topicIds: string[], status = "ready") {
  const [set] = await db
    .insert(studySets)
    .values({ spaceId, kind: "quiz", title: "Seeded", materialIds: [], topicIds: [...new Set(topicIds)], requestedCount: topicIds.length, generatedCount: topicIds.length, status })
    .returning();
  const items = await db
    .insert(learningItems)
    .values(
      topicIds.map((topicId, i) => ({
        setId: set.id,
        spaceId,
        topicId,
        kind: "mcq",
        position: i,
        prompt: `Seeded question ${set.id.slice(0, 8)} ${i}?`,
        options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
        correctIndex: i % 4,
        explanation: `Because ${i}.`,
        difficulty: "medium",
        normalizedPrompt: normalizePrompt(`Seeded question ${set.id} ${i}`),
        promptVersion: "seed",
      })),
    )
    .returning();
  await db.insert(itemSources).values(items.map((it, i) => ({ spaceId, itemId: it.id, chunkId: chunkIds[i % chunkIds.length] })));
  return { set, items };
}

async function e2e(a: Session, b: Session) {
  const stamp = Date.now();
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Attempts check" }).returning();
  const materialId = randomUUID();
  await db.insert(materials).values({ id: materialId, spaceId: space.id, originalName: "notes.pdf", blobPath: `check/${materialId}.pdf`, status: "ready" });
  const chunkRows = await db
    .insert(chunks)
    .values([0, 1, 2].map((i) => ({ materialId, spaceId: space.id, chunkIndex: i, content: `Chunk ${i} text.`, pageStart: i + 1, pageEnd: i + 1 })))
    .returning();
  const topicRows = await db
    .insert(topics)
    .values(["Joins", "Indexes"].map((name) => ({ spaceId: space.id, name, normalizedName: name.toLowerCase(), status: "confirmed", origin: "ai" })))
    .returning();
  const [t1, t2] = topicRows;
  await db.insert(materialTopics).values(topicRows.map((t) => ({ spaceId: space.id, materialId, topicId: t.id })));
  const chunkIds = chunkRows.map((c) => c.id);
  // Quiz 1: 6 questions on Joins, 4 on Indexes.
  const { set, items } = await seedSet(space.id, chunkIds, [t1.id, t1.id, t1.id, t1.id, t1.id, t1.id, t2.id, t2.id, t2.id, t2.id]);
  const byId = new Map(items.map((i) => [i.id, i]));

  // --- Start / resume ----------------------------------------------------------------
  let res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const started = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Start: 201 with 10 questions and no answers, explanations or sources", res.status === 201 && started.questions?.length === 10 && noAnswers(started));
  check(
    "Start: every question carries its topic's current name while in progress (T-12b, gap 4)",
    started.questions!.every((q) => q.topicName === (q.topicId === t1.id ? t1.name : t2.name)),
  );
  res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const resumed = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Start again: 200 resumes the same in-progress attempt", res.status === 200 && resumed.id === started.id);
  res = await startRoute(req(`/api/sets/${set.id}/attempts`, b, "POST"), p({ id: set.id }));
  check("Start: someone else's quiz → 404", res.status === 404);
  const generating = await seedSet(space.id, chunkIds, [t1.id], "generating");
  res = await startRoute(req(`/api/sets/${generating.set.id}/attempts`, a, "POST"), p({ id: generating.set.id }));
  check("Start: a quiz that isn't ready → 409 SET_NOT_READY", res.status === 409 && (await errorCode(res)) === "SET_NOT_READY");
  const optionOrders = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, started.id));
  check("Start: options shuffled per attempt (stored option order is a permutation)", optionOrders.every((o) => [...o.optionOrder].sort().join() === "0,1,2,3"));

  // --- Answers: Joins 3 right 3 wrong, Indexes 4 right → 7 of 10 ---------------------
  const display = (q: NonNullable<AttemptResponse["questions"]>[number], right: boolean) => {
    const item = byId.get(q.itemId)!;
    const correctText = item.options![item.correctIndex!];
    const correct = q.options.indexOf(correctText);
    return right ? correct : (correct + 1) % 4;
  };
  let joinsSeen = 0;
  const wrongItems: string[] = [];
  for (const q of started.questions!) {
    const right = q.topicId === t2.id || joinsSeen++ >= 3;
    if (!right) wrongItems.push(q.itemId);
    res = await answerRoute(req(`/api/attempts/${started.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: display(q, right) }), p({ id: started.id }));
    if (res.status !== 200) throw new Error(`autosave ${res.status}`);
  }
  const saved = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  const firstQ = started.questions![0];
  const savedFirst = saved.questions!.find((q) => q.itemId === firstQ.itemId)!;
  check("Autosave: the displayed choice is saved and returned as displayed", savedFirst.selectedIndex === display(firstQ, firstQ.topicId === t2.id || !wrongItems.includes(firstQ.itemId)) && noAnswers(saved));
  res = await answerRoute(req(`/api/attempts/${started.id}/answers`, a, "PATCH", { itemId: generating.items[0].id, selectedIndex: 0 }), p({ id: started.id }));
  check("Autosave: a question from another quiz → 400 ITEM_NOT_IN_ATTEMPT", res.status === 400 && (await errorCode(res)) === "ITEM_NOT_IN_ATTEMPT");
  res = await answerRoute(req(`/api/attempts/${started.id}/answers`, a, "PATCH", { itemId: firstQ.itemId, selectedIndex: 4 }), p({ id: started.id }));
  check("Autosave: option index outside 0–3 → 400", res.status === 400);
  res = await attemptRoute(req(`/api/attempts/${started.id}`, b), p({ id: started.id }));
  check("GET: someone else's attempt → 404 ATTEMPT_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ATTEMPT_NOT_FOUND");
  res = await answerRoute(req(`/api/attempts/${started.id}/answers`, b, "PATCH", { itemId: firstQ.itemId, selectedIndex: 0 }), p({ id: started.id }));
  check("Autosave: someone else's attempt → 404", res.status === 404);
  res = await attemptRoute(req(`/api/attempts/nope`, a), p({ id: "nope" }));
  check("GET: malformed id → 404", res.status === 404);
  res = await attemptRoute(req(`/api/attempts/${started.id}`, a), p({ id: started.id }));
  check("GET in progress: questions only, no answers", res.status === 200 && noAnswers(await res.json()));

  // Postgres itself rejects an attempt item from another quiz.
  const mismatch = await db
    .insert(attemptItems)
    .values({ attemptId: started.id, spaceId: space.id, setId: set.id, itemId: generating.items[0].id, position: 99, optionOrder: [0, 1, 2, 3] })
    .then(() => "inserted", () => "rejected");
  check("Database rejects an attempt_items row for a question from another set", mismatch === "rejected");

  // --- Submit -------------------------------------------------------------------------------
  res = await submitRoute(req(`/api/attempts/${started.id}/submit`, a, "POST", { score: 10, total: 10 }), p({ id: started.id }));
  const submitted = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  const r = submitted.result!;
  check("Submit: 7 of 10 correct = 70% (forged score in the body ignored)", res.status === 200 && r.score === 7 && r.total === 10 && r.percent === 70, `${r?.score}/${r?.total}`);
  check(
    "Submit: score per topic (Joins 3/6, Indexes 4/4)",
    r.topics.find((t) => t.topicId === t1.id)?.correct === 3 && r.topics.find((t) => t.topicId === t1.id)?.total === 6 && r.topics.find((t) => t.topicId === t2.id)?.correct === 4,
  );
  const qr = r.questions[0];
  const qItem = byId.get(qr.itemId)!;
  check(
    "Results: correct answer (in displayed order), explanation, source with page, AI-generated label",
    qr.options[qr.correctIndex] === qItem.options![qItem.correctIndex!] && qr.explanation === qItem.explanation && qr.sources[0]?.materialName === "notes.pdf" && qr.sources[0]?.pages.length > 0 && qr.aiGenerated,
  );
  res = await submitRoute(req(`/api/attempts/${started.id}/submit`, a, "POST"), p({ id: started.id }));
  const again = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Double submit: one result, unchanged", again.result?.score === 7 && again.submittedAt === submitted.submittedAt);
  res = await answerRoute(req(`/api/attempts/${started.id}/answers`, a, "PATCH", { itemId: firstQ.itemId, selectedIndex: 0 }), p({ id: started.id }));
  check("Autosave after submit → 409 ATTEMPT_SUBMITTED", res.status === 409 && (await errorCode(res)) === "ATTEMPT_SUBMITTED");
  res = await submitRoute(req(`/api/attempts/${started.id}/submit`, b, "POST"), p({ id: started.id }));
  check("Submit: someone else's attempt → 404", res.status === 404);

  const reviews = await db.select().from(revisionItems).where(eq(revisionItems.studentId, a.userId));
  check(
    "Mistakes: each wrong answer creates exactly one open mistake (3 wrong → 3 rows, all open, no dates)",
    reviews.length === 3 && reviews.every((x) => x.clearedAt === null && wrongItems.includes(x.itemId)) && new Set(reviews.map((x) => x.itemId)).size === 3,
    `${reviews.length}`,
  );

  // --- Mastery ----------------------------------------------------------------------------------
  const progressOf = async () => (await (await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, a), p({ spaceId: space.id }))).json()) as SpaceProgress;
  let progress = await progressOf();
  const joins = () => progress.topics.find((t) => t.topicId === t1.id)!;
  const indexes = () => progress.topics.find((t) => t.topicId === t2.id)!;
  check("Mastery: Joins 3 of 6 = 50%, weak, listed first", joins().status === "weak" && joins().percent === 50 && progress.topics[0].topicId === t1.id);
  check(
    "TopicProgress: Joins has a Ready material and 3 open mistakes; Indexes has a Ready material and none",
    joins().hasReadyMaterial === true && joins().mistakes === 3 && indexes().hasReadyMaterial === true && indexes().mistakes === 0,
    `${joins().hasReadyMaterial} ${joins().mistakes}`,
  );
  check("Mastery: Indexes 4 questions = insufficient, 1 more needed", indexes().status === "insufficient" && indexes().needed === 1 && indexes().percent === null);
  res = await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, b), p({ spaceId: space.id }));
  check("Space progress: someone else's space → 404", res.status === 404);
  res = await allProgressRoute(req(`/api/progress`, a));
  const all = ((await res.json()) as { spaces: SpaceProgress[] }).spaces;
  check("My Analytics: lists the student's spaces", all.length === 1 && all[0].spaceId === space.id);

  // Retake: Joins all right, Indexes left unanswered → latest answer per question counts, unanswered skipped.
  res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const retake = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Retake: a new attempt with a fresh order", res.status === 201 && retake.id !== started.id);
  for (const q of retake.questions!.filter((q) => q.topicId === t1.id)) {
    await answerRoute(req(`/api/attempts/${retake.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: display(q, true) }), p({ id: retake.id }));
  }
  await submitRoute(req(`/api/attempts/${retake.id}/submit`, a, "POST"), p({ id: retake.id }));
  progress = await progressOf();
  check("Mastery after retake: Joins 6 of 6 = 100%, on track (only latest answers count)", joins().status === "on_track" && joins().percent === 100 && joins().counted === 6);
  check("Mastery after retake: unanswered Indexes questions don't count", indexes().counted === 4);
  const afterRetake = await db.select().from(revisionItems).where(eq(revisionItems.studentId, a.userId));
  check(
    "Mistakes: right answers in a retake clear the three open mistakes (no duplicate rows)",
    afterRetake.length === 3 && afterRetake.every((x) => x.clearedAt !== null) && (await progressOf()).topics.find((t) => t.topicId === t1.id)!.mistakes === 0,
    `${afterRetake.length}`,
  );

  // --- Gap 1 (T-12b): the Quiz Library's list fields ----------------------------------
  const listForSpace = async (session: Session) =>
    ((await (await setsListRoute(req(`/api/spaces/${space.id}/sets?kind=quiz`, session), p({ spaceId: space.id }))).json()) as { sets: SetListItemResponse[] }).sets;
  let setsList = await listForSpace(a);
  let listedSet = setsList.find((s) => s.id === set.id)!;
  check(
    "List: after a submitted retake, hasResults is true, latestAttempt is that result, activeCount counts every published item",
    listedSet.hasResults === true &&
      listedSet.latestAttempt.status === "submitted" &&
      listedSet.latestAttempt.attemptId === retake.id &&
      listedSet.activeCount === 10,
    JSON.stringify(listedSet.latestAttempt),
  );

  // Retake again, but Save & exit (never submit): hasResults must stay true from the earlier submitted attempt, and Delete must still refuse.
  res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const secondRetake = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Second retake: a fresh in-progress attempt", res.status === 201 && secondRetake.id !== retake.id);
  await answerRoute(req(`/api/attempts/${secondRetake.id}/answers`, a, "PATCH", { itemId: secondRetake.questions![0].itemId, selectedIndex: 0 }), p({ id: secondRetake.id }));
  setsList = await listForSpace(a);
  listedSet = setsList.find((s) => s.id === set.id)!;
  check(
    "List after Retake + Save & exit: hasResults stays true; latestAttempt is the new in-progress attempt with its answered count",
    listedSet.hasResults === true &&
      listedSet.latestAttempt.status === "in_progress" &&
      listedSet.latestAttempt.attemptId === secondRetake.id &&
      listedSet.latestAttempt.answeredCount === 1 &&
      listedSet.latestAttempt.totalCount === 10,
    JSON.stringify(listedSet.latestAttempt),
  );
  res = await deleteSetRoute(req(`/api/sets/${set.id}`, a, "DELETE"), p({ id: set.id }));
  check("Delete after Retake + Save & exit still refuses: 409 SET_HAS_RESULTS", res.status === 409 && (await errorCode(res)) === "SET_HAS_RESULTS");

  // Newest 10 only: a second quiz with 6 more Joins questions, all wrong.
  const second = await seedSet(space.id, chunkIds, Array(6).fill(t1.id));
  const secondById = new Map(second.items.map((i) => [i.id, i]));
  res = await startRoute(req(`/api/sets/${second.set.id}/attempts`, a, "POST"), p({ id: second.set.id }));
  const sa = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  for (const q of sa.questions!) {
    const item = secondById.get(q.itemId)!;
    const wrong = (q.options.indexOf(item.options![item.correctIndex!]) + 1) % 4;
    await answerRoute(req(`/api/attempts/${sa.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: wrong }), p({ id: sa.id }));
  }
  await submitRoute(req(`/api/attempts/${sa.id}/submit`, a, "POST"), p({ id: sa.id }));
  res = await masteryRoute(req(`/api/topics/${t1.id}/mastery`, a), p({ id: t1.id }));
  const detail = (await res.json()) as TopicMasteryDetail;
  check(
    "Mastery: newest 10 distinct questions only (6 wrong + 4 newest right = 40%, weak), listed in topic detail",
    detail.mastery.counted === 10 && detail.mastery.correct === 4 && detail.mastery.status === "weak" && detail.questions.length === 10,
    `${detail.mastery?.counted} ${detail.mastery?.correct}`,
  );
  check(
    "Topic detail: carries its space, a Ready material and its open mistakes (T-15)",
    detail.spaceId === space.id && detail.hasReadyMaterial === true && detail.mistakes === 6,
    `${detail.spaceId === space.id} ${detail.hasReadyMaterial} ${detail.mistakes}`,
  );
  res = await masteryRoute(req(`/api/topics/${t1.id}/mastery`, b), p({ id: t1.id }));
  check("Topic mastery: someone else's topic → 404", res.status === 404);
  await db.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, second.items[0].id));
  res = await masteryRoute(req(`/api/topics/${t1.id}/mastery`, a), p({ id: t1.id }));
  const afterRemove = (await res.json()) as TopicMasteryDetail;
  check("Mastery: a removed question no longer counts", afterRemove.questions.every((q) => q.itemId !== second.items[0].id) && afterRemove.mastery.counted === 10);

  // --- Mistakes (T-15) --------------------------------------------------------------------
  const masteryOnly = async () =>
    JSON.stringify((await progressOf()).topics.map(({ topicId, status, counted, correct, percent, needed }) => ({ topicId, status, counted, correct, percent, needed })));
  const mistakesOf = async (query: string, s: Session | null = a) => {
    const r = await mistakesRoute(req(`/api/revision/mistakes?${query}`, s));
    return { status: r.status, json: (await r.json()) as MistakesResponse & { error?: { code?: string } } };
  };
  const allItems = [...byId.values(), ...secondById.values()];
  const mistakeItem = async (revisionId: string) => {
    const [row] = await db.select().from(revisionItems).where(eq(revisionItems.id, revisionId));
    return { row, item: allItems.find((i) => i.id === row.itemId)! };
  };

  // Indexes gets a third quiz with one wrong answer, made older than every Joins mistake, so "weak topics first" is visible.
  const third = await seedSet(space.id, chunkIds, Array(5).fill(t2.id));
  const thirdById = new Map(third.items.map((i) => [i.id, i]));
  res = await startRoute(req(`/api/sets/${third.set.id}/attempts`, a, "POST"), p({ id: third.set.id }));
  const ta = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  let indexesWrong = "";
  for (const [i, q] of ta.questions!.entries()) {
    const item = thirdById.get(q.itemId)!;
    const correct = q.options.indexOf(item.options![item.correctIndex!]);
    if (i === 0) indexesWrong = q.itemId;
    await answerRoute(req(`/api/attempts/${ta.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: i === 0 ? (correct + 1) % 4 : correct }), p({ id: ta.id }));
  }
  await submitRoute(req(`/api/attempts/${ta.id}/submit`, a, "POST"), p({ id: ta.id }));
  await db.update(revisionItems).set({ createdAt: sql`now() - interval '2 days'` }).where(and(eq(revisionItems.studentId, a.userId), eq(revisionItems.itemId, indexesWrong)));
  progress = await progressOf();
  check("Mistakes: Indexes is now on track (8 of 9) with 1 open mistake — a topic can be on track and still have a mistake", indexes().status === "on_track" && indexes().mistakes === 1, `${indexes().status} ${indexes().mistakes}`);

  let bySpace = await mistakesOf(`spaceId=${space.id}`);
  // Joins: the 6 wrong answers of the second quiz, minus the one removed above; Indexes: 1.
  check("Mistakes by space: open mistakes only, 6 in all (5 Joins + 1 Indexes), total counts them all", bySpace.status === 200 && bySpace.json.items.length === 6 && bySpace.json.total === 6, `${bySpace.json.items?.length}/${bySpace.json.total}`);
  check("Mistakes by space: weak topics first — Joins before the older Indexes mistake", bySpace.json.items[5]?.topicId === t2.id && bySpace.json.items.slice(0, 5).every((i) => i.topicId === t1.id));
  check("Mistakes by space: questions come with 4 options and no answers or explanations", bySpace.json.items.every((i) => i.options.length === 4 && i.topicName.length > 0) && noAnswers(bySpace.json));
  const byTopic = await mistakesOf(`topicId=${t2.id}`);
  check("Mistakes by topic: only that topic's open mistakes", byTopic.status === 200 && byTopic.json.items.length === 1 && byTopic.json.items[0].topicId === t2.id && byTopic.json.total === 1);

  for (const [name, query] of [
    ["neither parameter", ""],
    ["both parameters", `topicId=${t1.id}&spaceId=${space.id}`],
    ["a malformed topicId", "topicId=nope"],
    ["a malformed spaceId", "spaceId=nope"],
    ["an empty topicId", "topicId="],
  ] as const) {
    const r = await mistakesOf(query);
    check(`Mistakes: ${name} → 400 VALIDATION_ERROR`, r.status === 400 && r.json.error?.code === "VALIDATION_ERROR", `${r.status}`);
  }
  const foreignTopic = await mistakesOf(`topicId=${t1.id}`, b);
  check("Mistakes: someone else's topic → 404 TOPIC_NOT_FOUND", foreignTopic.status === 404 && foreignTopic.json.error?.code === "TOPIC_NOT_FOUND");
  const foreignSpace = await mistakesOf(`spaceId=${space.id}`, b);
  check("Mistakes: someone else's space → 404 SPACE_NOT_FOUND", foreignSpace.status === 404 && foreignSpace.json.error?.code === "SPACE_NOT_FOUND");
  res = await mistakesRoute(req(`/api/revision/mistakes?spaceId=${space.id}`, null));
  check("Mistakes: signed out → 401", res.status === 401);

  // Checking a mistake.
  const firstOpen = bySpace.json.items[0];
  const target = await mistakeItem(firstOpen.id);
  const rightIndex = target.item.correctIndex!;
  const wrongIndex = (rightIndex + 1) % 4;
  const checkItem = (id: string, key: string, selectedIndex: number, s: Session = a) =>
    checkRoute(req(`/api/revision/items/${id}/check`, s, "POST", { requestKey: key, selectedIndex }), p({ id }));
  const masteryBefore = await masteryOnly();
  const joinsMistakes = () => progressOf().then((pr) => pr.topics.find((t) => t.topicId === t1.id)!.mistakes);
  const beforeCount = await joinsMistakes();

  res = await checkItem(firstOpen.id, `key-wrong-${stamp}`, wrongIndex);
  const wrongResult = ((await res.json()) as { result: MistakeCheckResult }).result;
  bySpace = await mistakesOf(`spaceId=${space.id}`);
  check(
    "Check: a wrong answer → incorrect with the correct answer and explanation; the mistake stays open",
    res.status === 200 &&
      wrongResult.outcome === "incorrect" &&
      wrongResult.correctIndex === rightIndex &&
      wrongResult.explanation === target.item.explanation &&
      wrongResult.cleared === false &&
      bySpace.json.items.some((i) => i.id === firstOpen.id) &&
      (await joinsMistakes()) === beforeCount,
    JSON.stringify(wrongResult),
  );
  res = await checkItem(firstOpen.id, `key-right-${stamp}`, rightIndex);
  const rightResult = ((await res.json()) as { result: MistakeCheckResult }).result;
  bySpace = await mistakesOf(`spaceId=${space.id}`);
  check(
    "Check: a correct answer clears it — gone from the list, the topic's mistakes down by exactly one",
    rightResult.outcome === "correct" && rightResult.cleared === true && !bySpace.json.items.some((i) => i.id === firstOpen.id) && bySpace.json.total === 5 && (await joinsMistakes()) === beforeCount - 1,
    JSON.stringify(rightResult),
  );
  res = await checkItem(firstOpen.id, `key-right-${stamp}`, wrongIndex);
  const replay = ((await res.json()) as { result: MistakeCheckResult }).result;
  const events = await db.select({ n: count() }).from(revisionEvents).where(eq(revisionEvents.revisionItemId, firstOpen.id));
  check("Check: the same request key returns the first result and records one event", replay.outcome === "correct" && replay.cleared === true && events[0].n === 2, `${replay.outcome} events=${events[0].n}`);
  res = await checkItem(firstOpen.id, `key-after-${stamp}`, wrongIndex);
  const afterCleared = ((await res.json()) as { result: MistakeCheckResult }).result;
  const stillCleared = (await mistakeItem(firstOpen.id)).row.clearedAt !== null;
  check("Check: a check on an already-cleared mistake is recorded but never reopens it", res.status === 200 && afterCleared.outcome === "incorrect" && afterCleared.cleared === true && stillCleared);
  res = await checkItem(firstOpen.id, `key-b-${stamp}`, rightIndex, b);
  check("Check: someone else's item → 404 REVISION_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "REVISION_ITEM_NOT_FOUND");
  res = await checkItem("nope", `key-nope-${stamp}`, 0);
  check("Check: a malformed id → 404 REVISION_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "REVISION_ITEM_NOT_FOUND");
  res = await checkRoute(req(`/api/revision/items/${firstOpen.id}/check`, a, "POST", { requestKey: "short", selectedIndex: 9 }), p({ id: firstOpen.id }));
  check("Check: an invalid body → 400 VALIDATION_ERROR", res.status === 400 && (await errorCode(res)) === "VALIDATION_ERROR");
  check("Checks never change mastery (progress before and after identical)", (await masteryOnly()) === masteryBefore);

  // A later quiz answer reopens or clears. X was cleared by the check above; Y and Z are open.
  // Retake: X wrong (reopens), Y right (clears), Z wrong again (no duplicate).
  const rowsBefore = await db.select().from(revisionItems).where(eq(revisionItems.studentId, a.userId));
  const openNow = bySpace.json.items.filter((i) => i.topicId === t1.id);
  const [yMistake, zMistake] = await Promise.all([mistakeItem(openNow[0].id), mistakeItem(openNow[1].id)]);
  res = await startRoute(req(`/api/sets/${second.set.id}/attempts`, a, "POST"), p({ id: second.set.id }));
  const retake2 = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  const plan: Record<string, boolean> = { [target.item.id]: false, [yMistake.item.id]: true, [zMistake.item.id]: false };
  for (const q of retake2.questions!) {
    if (!(q.itemId in plan)) continue;
    const item = secondById.get(q.itemId)!;
    const correct = q.options.indexOf(item.options![item.correctIndex!]);
    await answerRoute(req(`/api/attempts/${retake2.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: plan[q.itemId] ? correct : (correct + 1) % 4 }), p({ id: retake2.id }));
  }
  await submitRoute(req(`/api/attempts/${retake2.id}/submit`, a, "POST"), p({ id: retake2.id }));
  const rowFor = (itemId: string) => db.select().from(revisionItems).where(and(eq(revisionItems.studentId, a.userId), eq(revisionItems.itemId, itemId)));
  const [x, y, z] = await Promise.all([rowFor(target.item.id), rowFor(yMistake.item.id), rowFor(zMistake.item.id)]);
  check("Mistakes: a later wrong quiz answer reopens a cleared mistake", x.length === 1 && x[0].clearedAt === null);
  check("Mistakes: a later correct quiz answer clears an open one", y.length === 1 && y[0].clearedAt !== null);
  check(
    "Mistakes: the same wrong answer again doesn't duplicate the open mistake",
    z.length === 1 && z[0].clearedAt === null && (await db.select().from(revisionItems).where(eq(revisionItems.studentId, a.userId))).length === rowsBefore.length,
  );

  // More than 20 open mistakes: the list shows 20, the total counts them all, weak topics first.
  // Open before: Joins 4 (X reopened, Z and two others; Y cleared) + Indexes 1 = 5; the new quiz adds 22 wrong Joins answers.
  const bulk = await seedSet(space.id, chunkIds, Array(22).fill(t1.id));
  const bulkById = new Map(bulk.items.map((i) => [i.id, i]));
  res = await startRoute(req(`/api/sets/${bulk.set.id}/attempts`, a, "POST"), p({ id: bulk.set.id }));
  const ba = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  for (const q of ba.questions!) {
    const item = bulkById.get(q.itemId)!;
    await answerRoute(req(`/api/attempts/${ba.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: (q.options.indexOf(item.options![item.correctIndex!]) + 1) % 4 }), p({ id: ba.id }));
  }
  await submitRoute(req(`/api/attempts/${ba.id}/submit`, a, "POST"), p({ id: ba.id }));
  bySpace = await mistakesOf(`spaceId=${space.id}`);
  const totalBefore = bySpace.json.total;
  check(
    `Mistakes: at most ${MISTAKES_SESSION_SIZE} in a session, total counts every open mistake (27), weak Joins first`,
    bySpace.json.items.length === MISTAKES_SESSION_SIZE && totalBefore === 27 && bySpace.json.items.every((i) => i.topicId === t1.id),
    `${bySpace.json.items.length}/${totalBefore}`,
  );

  // Removed questions and deleted materials leave the list and the counts; past results stay with "Source removed".
  const joinsBefore = await joinsMistakes();
  await db.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, zMistake.item.id));
  bySpace = await mistakesOf(`spaceId=${space.id}`);
  check("Mistakes: a removed question leaves the list and the topic's count", bySpace.json.total === totalBefore - 1 && (await joinsMistakes()) === joinsBefore - 1, `${bySpace.json.total}`);
  await db.delete(materials).where(eq(materials.id, materialId));
  bySpace = await mistakesOf(`spaceId=${space.id}`);
  progress = await progressOf();
  check("Mistakes: questions whose material was deleted leave the list and every count", bySpace.json.total === 0 && progress.topics.every((t) => t.mistakes === 0), `${bySpace.json.total}`);
  check(
    "TopicProgress: a topic whose material was deleted has hasReadyMaterial false but still appears with its history",
    progress.topics.length === 2 && progress.topics.every((t) => t.hasReadyMaterial === false) && joins().counted === 10 && indexes().counted === 9,
    `${progress.topics.length} ${joins().counted} ${indexes().counted}`,
  );
  res = await attemptRoute(req(`/api/attempts/${started.id}`, a), p({ id: started.id }));
  const past = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Past results still open with no sources (\"Source removed\") and the same score", res.status === 200 && past.result?.score === 7 && past.result.questions.every((q) => q.sources.length === 0));
  const [{ kept }] = await db.select({ kept: count() }).from(attempts).where(and(eq(attempts.studentId, a.userId), eq(attempts.status, "submitted")));
  check("Submitted attempts are kept", kept === 6, `${kept}`);

  // --- Deleting a quiz (#35): a quiz with submitted results is the student's record ---------
  const del = (id: string, s = a) => deleteSetRoute(req(`/api/sets/${id}`, s, "DELETE"), p({ id }));
  const setExists = async (id: string) => (await db.select({ id: studySets.id }).from(studySets).where(eq(studySets.id, id))).length === 1;
  const record = async () =>
    JSON.stringify({
      attempts: (await db.select({ n: count() }).from(attempts).where(eq(attempts.setId, set.id)))[0].n,
      reviews: (await db.select({ n: count() }).from(revisionItems).where(eq(revisionItems.studentId, a.userId)))[0].n,
      mastery: (await progressOf()).topics,
    });
  const before = await record();
  res = await del(set.id);
  check("Delete: a quiz with submitted results → 409 SET_HAS_RESULTS", res.status === 409 && (await errorCode(res)) === "SET_HAS_RESULTS");
  check("Delete refused: the quiz, its attempts, mastery and revision items are unchanged", (await setExists(set.id)) && (await record()) === before);
  res = await del(set.id, b);
  check("Delete: someone else's quiz → 404 SET_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "SET_NOT_FOUND");

  // The first material was deleted above, so new quizzes cite a fresh one.
  const moreId = randomUUID();
  await db.insert(materials).values({ id: moreId, spaceId: space.id, originalName: "more.pdf", blobPath: `check/${moreId}.pdf`, status: "ready" });
  const [moreChunk] = await db.insert(chunks).values({ materialId: moreId, spaceId: space.id, chunkIndex: 0, content: "More text.", pageStart: 1, pageEnd: 1 }).returning();
  const fresh = await seedSet(space.id, [moreChunk.id], [t1.id]);
  res = await del(fresh.set.id);
  check("Delete: a quiz never attempted → 204, gone", res.status === 204 && !(await setExists(fresh.set.id)));
  const failed = await seedSet(space.id, [moreChunk.id], [t1.id], "failed");
  res = await del(failed.set.id);
  check("Delete: a failed quiz → 204, gone", res.status === 204 && !(await setExists(failed.set.id)));
  res = await del(generating.set.id);
  check("Delete: a quiz still generating → 204, gone", res.status === 204 && !(await setExists(generating.set.id)));

  const open = await seedSet(space.id, [moreChunk.id], [t1.id]);
  const openAttempt = ((await (await startRoute(req(`/api/sets/${open.set.id}/attempts`, a, "POST"), p({ id: open.set.id }))).json()) as { attempt: AttemptResponse }).attempt;
  res = await del(open.set.id);
  const openLeft = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.id, openAttempt.id));
  check("Delete: a quiz with only an in-progress attempt → 204, the attempt goes with it", res.status === 204 && !(await setExists(open.set.id)) && openLeft.length === 0);
  res = await submitRoute(req(`/api/attempts/${openAttempt.id}/submit`, a, "POST"), p({ id: openAttempt.id }));
  check("Submit after its quiz was deleted → 404 ATTEMPT_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ATTEMPT_NOT_FOUND");

  // The race: a submit and an autosave queue behind the attempt's row lock while the quiz is
  // deleted (as deleteSet does: lock the attempts, then delete). Each must end as a 404, not a 500.
  const raced = await seedSet(space.id, [moreChunk.id], [t1.id]);
  const racedAttempt = ((await (await startRoute(req(`/api/sets/${raced.set.id}/attempts`, a, "POST"), p({ id: raced.set.id }))).json()) as { attempt: AttemptResponse }).attempt;
  let waiting: Promise<Response>[] = [];
  await db.transaction(async (tx) => {
    await tx.select({ id: attempts.id }).from(attempts).where(eq(attempts.setId, raced.set.id)).for("update");
    waiting = [
      submitRoute(req(`/api/attempts/${racedAttempt.id}/submit`, a, "POST"), p({ id: racedAttempt.id })),
      answerRoute(req(`/api/attempts/${racedAttempt.id}/answers`, a, "PATCH", { itemId: racedAttempt.questions![0].itemId, selectedIndex: 0 }), p({ id: racedAttempt.id })),
    ];
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await tx.delete(studySets).where(eq(studySets.id, raced.set.id));
  });
  const [racedSubmit, racedSave] = await Promise.all(waiting);
  check(
    "Race: a submit and an autosave waiting while their quiz is deleted → 404 ATTEMPT_NOT_FOUND, never 500",
    racedSubmit.status === 404 && racedSave.status === 404 && (await errorCode(racedSubmit)) === "ATTEMPT_NOT_FOUND" && (await errorCode(racedSave)) === "ATTEMPT_NOT_FOUND",
    `${racedSubmit.status} ${racedSave.status}`,
  );

  // Codex review on #37: a FIRST attempt created and submitted while the delete runs. Hold
  // that attempt's transaction open (not yet committed) and fire the delete: it must wait,
  // see the submitted result, and refuse, rather than miss it and cascade it away.
  const late = await seedSet(space.id, [moreChunk.id], [t1.id]);
  let lateDelete: Promise<Response> | undefined;
  let lateAttemptId = "";
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attempts)
      .values({ spaceId: space.id, setId: late.set.id, studentId: a.userId, status: "submitted", score: 0, total: 1, submittedAt: new Date() })
      .returning({ id: attempts.id });
    lateAttemptId = row.id;
    lateDelete = del(late.set.id);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
  const lateRes = await lateDelete!;
  const lateKept = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.id, lateAttemptId));
  check(
    "Race: a delete overlapping a first attempt being created and submitted → 409 SET_HAS_RESULTS, the result is kept",
    lateRes.status === 409 && (await errorCode(lateRes)) === "SET_HAS_RESULTS" && (await setExists(late.set.id)) && lateKept.length === 1,
    `${lateRes.status} kept=${lateKept.length}`,
  );

  // A start that queues behind the delete's lock on the quiz row (as deleteSet takes it) and
  // then finds the quiz gone ends as a 404, never a 500.
  const gone = await seedSet(space.id, [moreChunk.id], [t1.id]);
  let goneStart: Promise<Response> | undefined;
  await db.transaction(async (tx) => {
    await tx.select({ id: studySets.id }).from(studySets).where(eq(studySets.id, gone.set.id)).for("update");
    goneStart = startRoute(req(`/api/sets/${gone.set.id}/attempts`, a, "POST"), p({ id: gone.set.id }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await tx.delete(studySets).where(eq(studySets.id, gone.set.id));
  });
  const goneRes = await goneStart!;
  check("Race: starting a quiz while it is being deleted → 404 SET_NOT_FOUND, never 500", goneRes.status === 404 && (await errorCode(goneRes)) === "SET_NOT_FOUND", `${goneRes.status}`);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
