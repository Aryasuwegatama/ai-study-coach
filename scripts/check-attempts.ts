#!/usr/bin/env tsx
/**
 * Verifies T-14: attempts and server scoring, mastery and revision, end to
 * end through the route handlers against the dev database. Quizzes are
 * seeded directly (T-11b's check covers generation).
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
import { nextSchedule, type ReviewResult, type RevisionListResponse, type RevisionSessionItem } from "../src/features/revision/revision-schemas";
import type { AttemptResponse } from "../src/features/attempts/attempts-schemas";
import { POST as startRoute } from "../src/app/api/sets/[id]/attempts/route";
import { GET as attemptRoute } from "../src/app/api/attempts/[id]/route";
import { PATCH as answerRoute } from "../src/app/api/attempts/[id]/answers/route";
import { POST as submitRoute } from "../src/app/api/attempts/[id]/submit/route";
import { GET as allProgressRoute } from "../src/app/api/progress/route";
import { GET as spaceProgressRoute } from "../src/app/api/spaces/[spaceId]/progress/route";
import { GET as masteryRoute } from "../src/app/api/topics/[id]/mastery/route";
import { GET as revisionRoute } from "../src/app/api/revision/route";
import { POST as sessionRoute } from "../src/app/api/revision/session/route";
import { POST as reviewRoute } from "../src/app/api/revision/items/[id]/review/route";

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
  const s1 = nextSchedule(0, true), s2 = nextSchedule(s1.streak, true), s3 = nextSchedule(s2.streak, true), f = nextSchedule(s3.streak, false);
  check("Revision schedule: 1 → 3 → 7 → 7, failure resets to 1 and streak 0", [s1, s2, s3, f].map((s) => s.intervalDays).join() === "3,7,7,1" && f.streak === 0);

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
    check("Deleting a user deletes their attempts and revision items (no FK blocks it)", left === 0 && reviews === 0);
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
  const [{ tomorrow }] = (await db.execute<{ tomorrow: string }>(sql`select ((now() at time zone 'UTC')::date + 1)::text as tomorrow`)).rows;
  check(
    "Revision: each wrong answer creates one review item due tomorrow (student's local day)",
    reviews.length === 3 && reviews.every((x) => x.dueDate === tomorrow && x.intervalDays === 1 && wrongItems.includes(x.itemId)),
    `${reviews.length} ${reviews[0]?.dueDate} vs ${tomorrow}`,
  );

  // --- Mastery ----------------------------------------------------------------------------------
  const progressOf = async () => (await (await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, a), p({ spaceId: space.id }))).json()) as SpaceProgress;
  let progress = await progressOf();
  const joins = () => progress.topics.find((t) => t.topicId === t1.id)!;
  const indexes = () => progress.topics.find((t) => t.topicId === t2.id)!;
  check("Mastery: Joins 3 of 6 = 50%, weak, listed first", joins().status === "weak" && joins().percent === 50 && progress.topics[0].topicId === t1.id);
  check("Mastery: Indexes 4 questions = insufficient, 1 more needed", indexes().status === "insufficient" && indexes().needed === 1 && indexes().percent === null);
  res = await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, b), p({ spaceId: space.id }));
  check("Space progress: someone else's space → 404", res.status === 404);
  res = await allProgressRoute(req(`/api/progress`, a));
  const all = ((await res.json()) as { spaces: SpaceProgress[] }).spaces;
  check("My Progress: lists the student's spaces", all.length === 1 && all[0].spaceId === space.id);

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
  check("Revision: wrong answers already scheduled are not duplicated", (await db.select({ n: count() }).from(revisionItems).where(eq(revisionItems.studentId, a.userId)))[0].n === 3);

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
  res = await masteryRoute(req(`/api/topics/${t1.id}/mastery`, b), p({ id: t1.id }));
  check("Topic mastery: someone else's topic → 404", res.status === 404);
  await db.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, second.items[0].id));
  res = await masteryRoute(req(`/api/topics/${t1.id}/mastery`, a), p({ id: t1.id }));
  const afterRemove = (await res.json()) as TopicMasteryDetail;
  check("Mastery: a removed question no longer counts", afterRemove.questions.every((q) => q.itemId !== second.items[0].id) && afterRemove.mastery.counted === 10);

  // --- Revision --------------------------------------------------------------------------------
  const target = reviews[0];
  const list = async () => (await (await revisionRoute(req(`/api/revision`, a))).json()) as RevisionListResponse;
  let listed = await list();
  check("My Revision: tomorrow's items are in the next 7 days, none due today", listed.upcoming.length >= 3 && listed.dueToday.length === 0 && listed.overdue.length === 0);
  let session = ((await (await sessionRoute(req(`/api/revision/session`, a, "POST", {}))).json()) as { items: RevisionSessionItem[] }).items;
  const notDueCount = session.length;
  const reviewBody = (key: string, right: boolean) => {
    const item = [...byId.values(), ...secondById.values()].find((i) => i.id === target.itemId)!;
    return { requestKey: key, selectedIndex: right ? item.correctIndex! : (item.correctIndex! + 1) % 4 };
  };
  res = await reviewRoute(req(`/api/revision/items/${target.id}/review`, a, "POST", reviewBody(`key-early-${stamp}`, true)), p({ id: target.id }));
  check("Review: not due yet → 409 REVISION_NOT_DUE; session has no not-yet-due items", res.status === 409 && (await errorCode(res)) === "REVISION_NOT_DUE" && notDueCount === 0);

  const makeDue = (days: number) => db.update(revisionItems).set({ dueDate: sql`(now() at time zone 'UTC')::date - ${days}::int` }).where(eq(revisionItems.id, target.id));
  await makeDue(0);
  await db.update(revisionItems).set({ dueDate: sql`(now() at time zone 'UTC')::date - 2` }).where(eq(revisionItems.id, reviews[1].id));
  listed = await list();
  check("My Revision: Overdue and Today groups by local date", listed.dueToday.some((i) => i.id === target.id) && listed.overdue.some((i) => i.id === reviews[1].id));
  session = ((await (await sessionRoute(req(`/api/revision/session`, a, "POST", { spaceId: space.id }))).json()) as { items: RevisionSessionItem[] }).items;
  check("Session: due items with 4 options and no answers", session.length === 2 && session.every((i) => i.options.length === 4) && noAnswers(session));
  res = await sessionRoute(req(`/api/revision/session`, b, "POST", { spaceId: space.id }));
  check("Session: someone else's space → 404", res.status === 404);

  const masteryBefore = JSON.stringify((await progressOf()).topics);
  const review = async (key: string, right: boolean, s = a) =>
    reviewRoute(req(`/api/revision/items/${target.id}/review`, s, "POST", reviewBody(key, right)), p({ id: target.id }));
  res = await review(`key-1-${stamp}`, true);
  const first = ((await res.json()) as { result: ReviewResult }).result;
  const [{ plus3 }] = (await db.execute<{ plus3: string }>(sql`select ((now() at time zone 'UTC')::date + 3)::text as plus3`)).rows;
  check("Review: first success → next review in 3 days", first.outcome === "correct" && first.intervalDays === 3 && first.nextDueDate === plus3, JSON.stringify(first));
  res = await review(`key-1-${stamp}`, false);
  const dup = ((await res.json()) as { result: ReviewResult }).result;
  const events = await db.select({ n: count() }).from(revisionEvents).where(eq(revisionEvents.revisionItemId, target.id));
  check("Review: the same request key returns the first result and moves the schedule once", dup.outcome === "correct" && dup.nextDueDate === plus3 && events[0].n === 1);
  await makeDue(0);
  const secondReview = ((await (await review(`key-2-${stamp}`, true)).json()) as { result: ReviewResult }).result;
  await makeDue(0);
  const thirdReview = ((await (await review(`key-3-${stamp}`, true)).json()) as { result: ReviewResult }).result;
  await makeDue(0);
  const failReview = ((await (await review(`key-4-${stamp}`, false)).json()) as { result: ReviewResult }).result;
  const afterFail = (await db.select().from(revisionItems).where(eq(revisionItems.id, target.id)))[0];
  check("Review: then 7, capped at 7", secondReview.intervalDays === 7 && thirdReview.intervalDays === 7);
  check("Review: a wrong answer resets to 1 day and streak 0, and shows the correct answer", failReview.outcome === "incorrect" && failReview.intervalDays === 1 && afterFail.streak === 0 && failReview.explanation !== null);
  res = await review(`key-b-${stamp}`, true, b);
  check("Review: someone else's item → 404 REVISION_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "REVISION_ITEM_NOT_FOUND");
  check("Revision never changes mastery", JSON.stringify((await progressOf()).topics) === masteryBefore);

  // Removed questions and deleted materials leave revision; past results stay with "Source removed".
  await db.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, reviews[1].itemId));
  listed = await list();
  check("Revision: a removed question leaves My Revision", ![...listed.overdue, ...listed.dueToday, ...listed.upcoming].some((i) => i.id === reviews[1].id));
  await db.delete(materials).where(eq(materials.id, materialId));
  listed = await list();
  check("Revision: questions whose material was deleted leave My Revision", listed.overdue.length + listed.dueToday.length + listed.upcoming.length === 0);
  res = await attemptRoute(req(`/api/attempts/${started.id}`, a), p({ id: started.id }));
  const past = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Past results still open with no sources (\"Source removed\") and the same score", res.status === 200 && past.result?.score === 7 && past.result.questions.every((q) => q.sources.length === 0));
  const [{ kept }] = await db.select({ kept: count() }).from(attempts).where(and(eq(attempts.studentId, a.userId), eq(attempts.status, "submitted")));
  check("Submitted attempts are kept", kept === 3);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
