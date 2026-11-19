#!/usr/bin/env tsx
/**
 * Verifies T-15: My Plan items, suggestions and the dashboard summary, end
 * to end through the route handlers against the dev database. Quizzes are
 * seeded directly and answered through the attempt routes (no AI is called).
 *
 * Run with: pnpm run check:plan
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import type { SessionUser } from "../src/server/auth/auth-session";
import { db } from "../src/server/db/db-client";
import { chunks, itemSources, learningItems, materials, materialTopics, planItems, studySets, studySpaces, topics } from "../src/server/db/schema";
import { normalizePrompt } from "../src/features/quizzes/quizzes-schemas";
import type { AttemptResponse } from "../src/features/attempts/attempts-schemas";
import { MAX_OPEN_PLAN_ITEMS, SUGGESTION_KINDS, type PlanItemResponse, type Suggestion } from "../src/features/plan/plan-schemas";
import { getDashboardSummary } from "../src/features/dashboard/server/dashboard-service";
import { POST as startRoute } from "../src/app/api/sets/[id]/attempts/route";
import { PATCH as answerRoute } from "../src/app/api/attempts/[id]/answers/route";
import { POST as submitRoute } from "../src/app/api/attempts/[id]/submit/route";
import { GET as itemsRoute, POST as createRoute } from "../src/app/api/plan/items/route";
import { PATCH as patchRoute, DELETE as deleteRoute } from "../src/app/api/plan/items/[id]/route";
import { GET as suggestionsRoute } from "../src/app/api/plan/suggestions/route";

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

async function main() {
  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  const users: SessionUser[] = [];
  for (const label of ["a", "b"]) {
    const email = `check-plan-${label}-${stamp}@example.com`;
    const saved = await test.saveUser(test.createUser({ email, name: `Check Plan ${label}`, role: "student" }));
    const { headers } = await test.login({ userId: saved.id });
    sessions.push({ userId: saved.id, cookie: headers.get("cookie") ?? "" });
    users.push({ id: saved.id, email, name: `Check Plan ${label}`, role: "student", timeZone: null });
  }

  try {
    await e2e(sessions[0], sessions[1], users[0]);
  } catch (error) {
    check("End-to-end run completed", false, safeMessage(error));
  } finally {
    for (const s of sessions) await test.deleteUser(s.userId);
    const [{ left }] = await db
      .select({ left: count() })
      .from(planItems)
      .where(inArray(planItems.studentId, sessions.map((s) => s.userId)));
    check("Deleting a user deletes their plan items (no FK blocks it)", left === 0);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

/** A ready quiz with one question per entry in `topicIds`, every question sourced from `chunkId`. */
async function seedQuiz(spaceId: string, chunkId: string, topicIds: string[], title: string) {
  const [set] = await db
    .insert(studySets)
    .values({ spaceId, kind: "quiz", title, materialIds: [], topicIds: [...new Set(topicIds)], requestedCount: topicIds.length, generatedCount: topicIds.length, status: "ready" })
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
        prompt: `Plan check ${set.id.slice(0, 8)} question ${i}?`,
        options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
        correctIndex: i % 4,
        explanation: `Because ${i}.`,
        difficulty: "medium",
        normalizedPrompt: normalizePrompt(`Plan check ${set.id} question ${i}`),
        promptVersion: "seed",
      })),
    )
    .returning();
  await db.insert(itemSources).values(items.map((it) => ({ spaceId, itemId: it.id, chunkId })));
  return { set, items };
}

/** Starts an attempt, answers each question right (true), wrong (false) or not at all (null), and optionally submits. */
async function takeQuiz(s: Session, quiz: Awaited<ReturnType<typeof seedQuiz>>, decide: (index: number) => boolean | null, submit: boolean) {
  const byId = new Map(quiz.items.map((i) => [i.id, i]));
  let res = await startRoute(req(`/api/sets/${quiz.set.id}/attempts`, s, "POST"), p({ id: quiz.set.id }));
  const attempt = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  for (const q of attempt.questions!) {
    const index = quiz.items.findIndex((i) => i.id === q.itemId);
    const answer = decide(index);
    if (answer === null) continue;
    const item = byId.get(q.itemId)!;
    const correct = q.options.indexOf(item.options![item.correctIndex!]);
    await answerRoute(req(`/api/attempts/${attempt.id}/answers`, s, "PATCH", { itemId: q.itemId, selectedIndex: answer ? correct : (correct + 1) % 4 }), p({ id: attempt.id }));
  }
  if (submit) res = await submitRoute(req(`/api/attempts/${attempt.id}/submit`, s, "POST"), p({ id: attempt.id }));
  return attempt;
}

async function e2e(a: Session, b: Session, userA: SessionUser) {
  // --- Seed: one live space with 4 topics, one deleted space ----------------------------------
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Plan check" }).returning();
  const [gone] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Deleted space check" }).returning();
  const materialId = randomUUID();
  const reviewMaterialId = randomUUID();
  await db.insert(materials).values([
    { id: materialId, spaceId: space.id, originalName: "notes.pdf", blobPath: `check/${materialId}.pdf`, status: "ready" },
    { id: reviewMaterialId, spaceId: space.id, originalName: "slides.pptx", blobPath: `check/${reviewMaterialId}.pptx`, status: "review_topics" },
  ]);
  const [chunk] = await db.insert(chunks).values({ materialId, spaceId: space.id, chunkIndex: 0, content: "Chunk text.", pageStart: 1, pageEnd: 1 }).returning();
  const mk = (name: string, spaceId = space.id) => ({ spaceId, name, normalizedName: name.toLowerCase().replace(/\s/g, ""), status: "confirmed", origin: "ai" });
  const [tWeak, tFew, tNew, tOld] = await db.insert(topics).values([mk("Normalisation"), mk("Encryption"), mk("Indexing"), mk("Legacy topic")]).returning();
  // Normalisation, Encryption and Indexing are linked to a Ready material; Legacy topic's materials were all deleted.
  await db.insert(materialTopics).values([tWeak, tFew, tNew].map((t) => ({ spaceId: space.id, materialId, topicId: t.id })));

  // Quiz 1: 6 Normalisation (1 right, 5 wrong → weak, 5 mistakes) + 2 Encryption (both right → 3 more needed).
  const quiz1 = await seedQuiz(space.id, chunk.id, [tWeak.id, tWeak.id, tWeak.id, tWeak.id, tWeak.id, tWeak.id, tFew.id, tFew.id], "Seeded one");
  let rightSoFar = 0;
  await takeQuiz(a, quiz1, (i) => (i < 6 ? rightSoFar++ === 0 : true), true);
  // Quiz 2: 5 Legacy topic questions, all wrong → weak with 5 mistakes, but no Ready material.
  const quiz2 = await seedQuiz(space.id, chunk.id, Array(5).fill(tOld.id), "Seeded legacy");
  await takeQuiz(a, quiz2, () => false, true);
  // Quiz 3: 4 Indexing questions, 2 answered and never submitted → "Resume … 2 of 4 answered"; Indexing stays untested.
  const quiz3 = await seedQuiz(space.id, chunk.id, Array(4).fill(tNew.id), "Database concepts check");
  let answeredSoFar = 0;
  await takeQuiz(a, quiz3, () => (answeredSoFar++ < 2 ? true : null), false);

  // A deleted space with everything that would otherwise suggest something.
  const goneMaterial = randomUUID();
  await db.insert(materials).values({ id: goneMaterial, spaceId: gone.id, originalName: "old.pdf", blobPath: `check/${goneMaterial}.pdf`, status: "review_topics" });
  const [goneTopic] = await db.insert(topics).values(mk("Gone topic", gone.id)).returning();
  const goneReady = randomUUID();
  await db.insert(materials).values({ id: goneReady, spaceId: gone.id, originalName: "old2.pdf", blobPath: `check/${goneReady}.pdf`, status: "ready" });
  await db.insert(materialTopics).values({ spaceId: gone.id, materialId: goneReady, topicId: goneTopic.id });
  const [goneChunk] = await db.insert(chunks).values({ materialId: goneReady, spaceId: gone.id, chunkIndex: 0, content: "Gone.", pageStart: 1, pageEnd: 1 }).returning();
  const goneQuiz = await seedQuiz(gone.id, goneChunk.id, [goneTopic.id, goneTopic.id], "Gone quiz");
  await takeQuiz(a, goneQuiz, (i) => (i === 0 ? null : false), false);
  const [goneItem] = await db
    .insert(planItems)
    .values({ studentId: a.userId, kind: "own", title: "Plan in a deleted space", spaceId: gone.id })
    .returning();
  await db.update(studySpaces).set({ deletedAt: new Date() }).where(eq(studySpaces.id, gone.id));

  // --- Suggestions ------------------------------------------------------------------------------
  const getSuggestions = async (s: Session) => ((await (await suggestionsRoute(req(`/api/plan/suggestions`, s))).json()) as { suggestions: Suggestion[] }).suggestions;
  let suggestions = await getSuggestions(a);
  const kinds = suggestions.map((s) => s.kind);
  const order = SUGGESTION_KINDS.slice();
  check(
    "Suggestions: every kind appears, in ranking order (weak, mistakes, not enough evidence, unfinished quiz, not tested, topic review)",
    kinds.join() === ["weak_topic", "mistakes", "mistakes", "not_enough_evidence", "unfinished_quiz", "not_tested", "topic_review"].join() && order.every((k) => kinds.includes(k)),
    kinds.join(),
  );
  const weak = suggestions.find((s) => s.kind === "weak_topic")!;
  check(
    "Suggestions: a weak topic reads \"is weak (17% of the latest 6)\" and leads to Practise this topic",
    weak.detail === "Normalisation is weak (17% of the latest 6). Practise it." &&
      weak.actionLabel === "Practise this topic" &&
      weak.href === `/spaces/${space.id}/quizzes/new?topic=${tWeak.id}` &&
      weak.plan.kind === "practise_topic" &&
      weak.plan.topicId === tWeak.id &&
      weak.spaceName === "Plan check",
    JSON.stringify(weak),
  );
  const mistakeSuggestions = suggestions.filter((s) => s.kind === "mistakes");
  check(
    "Suggestions: mistakes to review (same count: by name), with the Review mistakes action",
    mistakeSuggestions.map((s) => s.detail).join("|") === "5 questions you got wrong in Legacy topic|5 questions you got wrong in Normalisation" &&
      mistakeSuggestions[0].href === `/plan/review?topicId=${tOld.id}` &&
      mistakeSuggestions[0].actionLabel === "Review mistakes",
    mistakeSuggestions.map((s) => s.detail).join("|"),
  );
  check(
    "Suggestions: not enough evidence names how many more answers are needed",
    suggestions.find((s) => s.kind === "not_enough_evidence")?.detail === "Answer 3 more questions on Encryption to get a score",
  );
  const resume = suggestions.find((s) => s.kind === "unfinished_quiz")!;
  check(
    "Suggestions: an unfinished quiz reads \"Resume …, 2 of 4 answered\" and links to the quiz",
    resume.detail === "Resume Database concepts check, 2 of 4 answered" && resume.actionLabel === "Resume quiz" && resume.href === `/spaces/${space.id}/quizzes/${quiz3.set.id}` && resume.plan.setId === quiz3.set.id,
    resume.detail,
  );
  check("Suggestions: a topic not tested yet", suggestions.find((s) => s.kind === "not_tested")?.detail === "Indexing hasn't been tested yet");
  const review = suggestions.find((s) => s.kind === "topic_review")!;
  check(
    "Suggestions: a material waiting for topic review links to its topic review page",
    review.actionLabel === "Review topics" && review.href === `/spaces/${space.id}/materials/${reviewMaterialId}/topics` && review.plan.materialId === reviewMaterialId,
  );
  check(
    "Suggestions: a weak topic from deleted material only gives \"mistakes to review\" (no Practise suggestion for it)",
    suggestions.filter((s) => s.plan.topicId === tOld.id).map((s) => s.kind).join() === "mistakes",
  );
  check("Suggestions: nothing from a deleted space", suggestions.every((s) => s.spaceId !== gone.id) && !JSON.stringify(suggestions).includes("Gone"));
  check("Suggestions: none are in the plan yet", suggestions.every((s) => s.inPlan === false));
  check("Suggestions: another student sees none of them", (await getSuggestions(b)).length === 0);
  check("Suggestions: no dates anywhere (nothing scheduled, nothing overdue)", !/\b(overdue|due)\b|\d{4}-\d{2}-\d{2}/i.test(JSON.stringify(suggestions)));

  // --- Plan items: create ----------------------------------------------------------------------------
  const create = (s: Session, body: unknown) => createRoute(req(`/api/plan/items`, s, "POST", body));
  const list = async (s: Session = a) => ((await (await itemsRoute(req(`/api/plan/items`, s))).json()) as { items: PlanItemResponse[] }).items;
  const patch = (s: Session, id: string, body: unknown) => patchRoute(req(`/api/plan/items/${id}`, s, "PATCH", body), p({ id }));
  const remove = (s: Session, id: string) => deleteRoute(req(`/api/plan/items/${id}`, s, "DELETE"), p({ id }));
  const created = async (res: Response) => ((await res.json()) as { item: PlanItemResponse }).item;

  let res = await create(a, { kind: "own", title: "  Read chapter 4  " });
  const ownNoSpace = await created(res);
  check(
    "Create own item with no space: 201, trimmed title, no link, no day (Anytime)",
    res.status === 201 && ownNoSpace.title === "Read chapter 4" && ownNoSpace.spaceId === null && ownNoSpace.spaceName === null && ownNoSpace.href === null && ownNoSpace.plannedOn === null && ownNoSpace.doneAt === null,
    JSON.stringify(ownNoSpace),
  );
  res = await create(a, { kind: "own", title: "Revise SQL", spaceId: space.id, plannedOn: "2026-12-05" });
  const ownSpace = await created(res);
  check("Create own item with a space and a day it picked itself", res.status === 201 && ownSpace.spaceId === space.id && ownSpace.spaceName === "Plan check" && ownSpace.plannedOn === "2026-12-05" && ownSpace.href === null);
  const kinds4 = [
    ["practise_topic", { topicId: tWeak.id }, `/spaces/${space.id}/quizzes/new?topic=${tWeak.id}`],
    ["review_mistakes", { topicId: tWeak.id }, `/plan/review?topicId=${tWeak.id}`],
    ["resume_quiz", { setId: quiz3.set.id }, `/spaces/${space.id}/quizzes/${quiz3.set.id}`],
    ["review_topics", { materialId: reviewMaterialId }, `/spaces/${space.id}/materials/${reviewMaterialId}/topics`],
  ] as const;
  const made: Record<string, PlanItemResponse> = {};
  for (const [kind, target, href] of kinds4) {
    res = await create(a, { kind, title: `Item ${kind}`, ...target });
    const item = await created(res);
    made[kind] = item;
    check(`Create ${kind}: 201, space derived from the target, link built from the ids`, res.status === 201 && item.spaceId === space.id && item.href === href && item.kind === kind, JSON.stringify(item));
  }
  res = await create(a, { kind: "own", title: "Forged", href: "javascript:alert(1)", studentId: b.userId, spaceId: space.id, doneAt: "2020-01-01", id: randomUUID() });
  const forged = await created(res);
  const [forgedRow] = await db.select().from(planItems).where(eq(planItems.id, forged.id));
  check(
    "A client-sent href, studentId, doneAt or id is ignored: the item is the signed-in student's with no link",
    res.status === 201 && forged.href === null && forgedRow.studentId === a.userId && forgedRow.doneAt === null && forged.id === forgedRow.id,
  );
  await remove(a, forged.id);

  // --- Validation ----------------------------------------------------------------------------------
  const bad: [string, unknown][] = [
    ["an empty title", { kind: "own", title: "" }],
    ["a blank title", { kind: "own", title: "   " }],
    ["a 121-character title", { kind: "own", title: "x".repeat(121) }],
    ["a bad date", { kind: "own", title: "x", plannedOn: "2026-13-40" }],
    ["a date that isn't a date", { kind: "own", title: "x", plannedOn: "tomorrow" }],
    ["an unknown kind", { kind: "reminder", title: "x" }],
    ["practise_topic with no topicId", { kind: "practise_topic", title: "x" }],
    ["practise_topic with a setId instead", { kind: "practise_topic", title: "x", setId: quiz3.set.id }],
    ["practise_topic with a topicId and a spaceId", { kind: "practise_topic", title: "x", topicId: tWeak.id, spaceId: space.id }],
    ["resume_quiz with a topicId", { kind: "resume_quiz", title: "x", topicId: tWeak.id }],
    ["review_topics with a topicId", { kind: "review_topics", title: "x", topicId: tWeak.id }],
    ["own with a topicId", { kind: "own", title: "x", topicId: tWeak.id }],
    ["a malformed id", { kind: "practise_topic", title: "x", topicId: "nope" }],
  ];
  for (const [name, body] of bad) {
    res = await create(a, body);
    check(`Validation: ${name} → 400 VALIDATION_ERROR`, res.status === 400 && (await errorCode(res)) === "VALIDATION_ERROR", `${res.status}`);
  }
  res = await createRoute(new Request(`${BASE}/api/plan/items`, { method: "POST", headers: { "content-type": "application/json", cookie: a.cookie }, body: "{not json" }));
  check("Validation: a body that isn't JSON → 400", res.status === 400);
  res = await createRoute(req(`/api/plan/items`, null, "POST", { kind: "own", title: "x" }));
  check("Signed out: create → 401", res.status === 401);
  res = await itemsRoute(req(`/api/plan/items`, null));
  check("Signed out: list → 401", res.status === 401);
  res = await suggestionsRoute(req(`/api/plan/suggestions`, null));
  check("Signed out: suggestions → 401", res.status === 401);

  // --- Ownership --------------------------------------------------------------------------------------
  for (const [name, body, code] of [
    ["another student's topic", { kind: "practise_topic", title: "x", topicId: tWeak.id }, "TOPIC_NOT_FOUND"],
    ["another student's topic (review mistakes)", { kind: "review_mistakes", title: "x", topicId: tWeak.id }, "TOPIC_NOT_FOUND"],
    ["another student's quiz", { kind: "resume_quiz", title: "x", setId: quiz3.set.id }, "SET_NOT_FOUND"],
    ["another student's material", { kind: "review_topics", title: "x", materialId: reviewMaterialId }, "MATERIAL_NOT_FOUND"],
    ["another student's space", { kind: "own", title: "x", spaceId: space.id }, "SPACE_NOT_FOUND"],
    ["a deleted space", { kind: "own", title: "x", spaceId: gone.id }, "SPACE_NOT_FOUND"],
  ] as const) {
    res = await create(b, body);
    check(`Ownership: ${name} as a target → 404 ${code}`, res.status === 404 && (await errorCode(res)) === code, `${res.status}`);
  }
  check("Ownership: another student's list doesn't include these items", (await list(b)).length === 0);
  res = await patch(b, ownNoSpace.id, { title: "Hacked" });
  check("Ownership: another student's item, edit → 404 PLAN_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "PLAN_ITEM_NOT_FOUND");
  res = await remove(b, ownNoSpace.id);
  check("Ownership: another student's item, delete → 404 PLAN_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "PLAN_ITEM_NOT_FOUND");
  res = await patch(a, "nope", { title: "x" });
  check("A malformed item id → 404 PLAN_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "PLAN_ITEM_NOT_FOUND");
  res = await patch(a, randomUUID(), { title: "x" });
  check("A missing item id → 404 PLAN_ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "PLAN_ITEM_NOT_FOUND");
  check("Ownership: the item is unchanged after the other student's attempts", (await list(a)).find((i) => i.id === ownNoSpace.id)?.title === "Read chapter 4");

  // --- Sorting, done, edit, delete ----------------------------------------------------------------------
  // Open items by planned day, then Anytime (oldest first); done items last. A past day is just a date.
  const past = await created(await create(a, { kind: "own", title: "Past day", plannedOn: "2020-01-02" }));
  let items = await list();
  const openOrder = items.filter((i) => !i.doneAt).map((i) => i.id);
  const expected = [past.id, ownSpace.id, ownNoSpace.id, made.practise_topic.id, made.review_mistakes.id, made.resume_quiz.id, made.review_topics.id];
  check("Sorting: open items by planned day (a past day is just a date), then Anytime in the order added", openOrder.join() === expected.join(), openOrder.length.toString());
  check("A planned day in the past comes back as the plain date it was", items.find((i) => i.id === past.id)?.plannedOn === "2020-01-02");

  res = await patch(a, ownNoSpace.id, { done: true });
  const doneItem = ((await res.json()) as { item: PlanItemResponse }).item;
  items = await list();
  check("Done: the item gets a done time and moves after every open item", res.status === 200 && doneItem.doneAt !== null && items[items.length - 1].id === ownNoSpace.id && items.slice(0, -1).every((i) => !i.doneAt));
  res = await patch(a, made.review_topics.id, { done: true });
  items = await list();
  check("Done: newest done first", items.slice(-2).map((i) => i.id).join() === [made.review_topics.id, ownNoSpace.id].join());
  res = await patch(a, ownNoSpace.id, { done: false });
  const undone = ((await res.json()) as { item: PlanItemResponse }).item;
  check("Undo: the done time is cleared and the item is open again", res.status === 200 && undone.doneAt === null && (await list()).find((i) => i.id === ownNoSpace.id)!.doneAt === null);
  res = await patch(a, ownNoSpace.id, { title: "Read chapter 5", plannedOn: "2026-11-25" });
  const edited = ((await res.json()) as { item: PlanItemResponse }).item;
  check("Edit: title and day", res.status === 200 && edited.title === "Read chapter 5" && edited.plannedOn === "2026-11-25");
  res = await patch(a, ownNoSpace.id, { plannedOn: null });
  const cleared = ((await res.json()) as { item: PlanItemResponse }).item;
  check("Edit: clearing the day (null) makes it Anytime; the title is untouched", cleared.plannedOn === null && cleared.title === "Read chapter 5");
  for (const [name, body] of [["an empty patch", {}], ["a blank title", { title: " " }], ["a bad day", { plannedOn: "31/12/2026" }], ["done that isn't a boolean", { done: "yes" }]] as const) {
    res = await patch(a, ownNoSpace.id, body);
    check(`Edit validation: ${name} → 400`, res.status === 400 && (await errorCode(res)) === "VALIDATION_ERROR", `${res.status}`);
  }
  res = await patch(a, ownNoSpace.id, { studentId: b.userId, href: "https://example.com", title: "Still mine" });
  const [stillMine] = await db.select().from(planItems).where(eq(planItems.id, ownNoSpace.id));
  check("Edit: a client-sent studentId or href is ignored", res.status === 200 && stillMine.studentId === a.userId && ((await list()).find((i) => i.id === ownNoSpace.id)?.href ?? null) === null);
  res = await remove(a, past.id);
  check("Delete: 204, and the item is gone", res.status === 204 && !(await list()).some((i) => i.id === past.id));
  res = await remove(a, past.id);
  check("Delete: again → 404 PLAN_ITEM_NOT_FOUND", res.status === 404);

  // --- In plan --------------------------------------------------------------------------------------------
  // The plan already has "practise Normalisation" and "review mistakes in Normalisation", so those two suggestions flip.
  suggestions = await getSuggestions(a);
  check(
    "inPlan flips for a suggestion once it is in the plan (same kind and target), and only for those",
    suggestions.filter((s) => s.inPlan).map((s) => s.key).sort().join() === [`weak_topic:${tWeak.id}`, `mistakes:${tWeak.id}`, `unfinished_quiz:${quiz3.set.id}`].sort().join(),
    suggestions.filter((s) => s.inPlan).map((s) => s.key).join(),
  );
  // "Add to my plan" posts the suggestion's own `plan` body and title.
  const untested = suggestions.find((s) => s.kind === "not_tested")!;
  res = await create(a, { ...untested.plan, title: untested.title });
  const added = await created(res);
  check("Adding a suggestion posts its plan body and title: the item has that title and the suggestion's link", res.status === 201 && added.title === untested.title && added.href === untested.href, JSON.stringify(added));
  suggestions = await getSuggestions(a);
  check("Once added, that suggestion shows as in the plan", suggestions.find((s) => s.key === untested.key)?.inPlan === true);
  await patch(a, added.id, { done: true });
  suggestions = await getSuggestions(a);
  check("A done item no longer counts as in the plan", suggestions.find((s) => s.key === untested.key)?.inPlan === false);

  // --- A deleted space hides its items; a deleted material leaves the item with no link ---------------------
  check("A deleted space hides its items", !(await list()).some((i) => i.id === goneItem.id));
  res = await patch(a, goneItem.id, { title: "Back from the dead" });
  check("A deleted space's item can't be edited → 404", res.status === 404 && (await errorCode(res)) === "PLAN_ITEM_NOT_FOUND");
  const withMaterial = await created(await create(a, { kind: "review_topics", title: "Review slides topics", materialId: reviewMaterialId }));
  check("Before the delete the item has its link", withMaterial.href === `/spaces/${space.id}/materials/${reviewMaterialId}/topics`);
  await db.delete(materials).where(eq(materials.id, reviewMaterialId));
  const afterDelete = (await list()).find((i) => i.id === withMaterial.id)!;
  check("A deleted material leaves the item with its title and no link", afterDelete.title === "Review slides topics" && afterDelete.materialId === null && afterDelete.href === null);
  suggestions = await getSuggestions(a);
  check("A deleted material's topic-review suggestion is gone", suggestions.every((s) => s.kind !== "topic_review"));

  // --- Dashboard summary ---------------------------------------------------------------------------------------
  const summary = await getDashboardSummary(userA);
  check(
    "Dashboard summary: the numbers match the seeded data (1 live space, 2 quizzes completed, 2 weak topics, 10 open mistakes)",
    summary.activeSpaces === 1 && summary.quizzesCompleted === 2 && summary.weakTopics === 2 && summary.openMistakes === 10,
    JSON.stringify({ ...summary, suggestions: summary.suggestions.length }),
  );
  check(
    "Dashboard summary: the latest unfinished quiz and the top 3 suggestions",
    summary.resumeQuiz?.title === "Database concepts check" && summary.resumeQuiz.answered === 2 && summary.resumeQuiz.total === 4 && summary.resumeQuiz.href === `/spaces/${space.id}/quizzes/${quiz3.set.id}` && summary.suggestions.length === 3 && summary.suggestions[0].kind === "weak_topic",
  );
  const keys = Object.keys(summary).sort().join();
  check(
    "Dashboard summary: no average, accuracy or percentage across topics (and no dates)",
    keys === "activeSpaces,openMistakes,quizzesCompleted,resumeQuiz,suggestions,weakTopics" && !/average|accuracy|overall/i.test(JSON.stringify(summary)),
    keys,
  );
  const empty = await getDashboardSummary({ ...userA, id: b.userId });
  check("Dashboard summary: a new student gets zeros, no quiz to resume and no suggestions", empty.activeSpaces === 0 && empty.quizzesCompleted === 0 && empty.weakTopics === 0 && empty.openMistakes === 0 && empty.resumeQuiz === null && empty.suggestions.length === 0);

  // --- The limit -------------------------------------------------------------------------------------------------
  await db.insert(planItems).values(Array.from({ length: MAX_OPEN_PLAN_ITEMS }, (_, i) => ({ studentId: b.userId, kind: "own", title: `Filler ${i}` })));
  res = await create(b, { kind: "own", title: "The 101st" });
  check("Limit: the 101st open item → 409 PLAN_ITEM_LIMIT", res.status === 409 && (await errorCode(res)) === "PLAN_ITEM_LIMIT", `${res.status}`);
  const bItems = await list(b);
  await patch(b, bItems[0].id, { done: true });
  res = await create(b, { kind: "own", title: "Room again after one is done" });
  check("Limit: marking one done makes room (done items don't count)", res.status === 201);
  res = await create(b, { kind: "own", title: "Full again" });
  check("Limit: and it is full again at 100 open", res.status === 409);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
