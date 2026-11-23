#!/usr/bin/env tsx
/**
 * Verifies T-12b's Report issue feature: ownership, validation, the
 * one-report-per-student-per-question rule, "Remove from my practice"
 * (generation, mastery and mistakes already filter on `status =
 * 'active'`) and the `SET_NO_ACTIVE_QUESTIONS` guard, end to end through
 * the route handlers against the dev database.
 *
 * Run with: pnpm run check:reports
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { chunks, contentReports, itemSources, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "../src/server/db/schema";
import { normalizePrompt } from "../src/features/quizzes/quizzes-schemas";
import { masteryFrom } from "../src/features/progress/progress-schemas";
import type { TopicMasteryDetail } from "../src/features/progress/progress-schemas";
import type { AttemptResponse } from "../src/features/attempts/attempts-schemas";
import type { MistakesResponse } from "../src/features/revision/revision-schemas";
import type { ReportResponse } from "../src/features/reports/reports-schemas";
import { POST as startRoute } from "../src/app/api/sets/[id]/attempts/route";
import { GET as attemptRoute } from "../src/app/api/attempts/[id]/route";
import { PATCH as answerRoute } from "../src/app/api/attempts/[id]/answers/route";
import { POST as submitRoute } from "../src/app/api/attempts/[id]/submit/route";
import { POST as reportRoute } from "../src/app/api/items/[id]/report/route";
import { GET as masteryRoute } from "../src/app/api/topics/[id]/mastery/route";
import { GET as mistakesRoute } from "../src/app/api/revision/mistakes/route";

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
  const m = (n: number, c: number) => masteryFrom(n, c);
  check("Mastery pure rule sanity: 5 of 2 = 40%, weak", m(5, 2).status === "weak" && m(5, 2).percent === 40);

  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  for (const label of ["a", "b"]) {
    const saved = await test.saveUser(test.createUser({ email: `check-reports-${label}-${stamp}@example.com`, name: `Check Reports ${label}`, role: "student" }));
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
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

async function seedSet(spaceId: string, chunkId: string, topicId: string, count: number) {
  const [set] = await db
    .insert(studySets)
    .values({ spaceId, kind: "quiz", title: "Seeded", materialIds: [], topicIds: [topicId], requestedCount: count, generatedCount: count, status: "ready" })
    .returning();
  const items = await db
    .insert(learningItems)
    .values(
      Array.from({ length: count }, (_, i) => ({
        setId: set.id,
        spaceId,
        topicId,
        kind: "mcq",
        position: i,
        prompt: `Seeded report question ${set.id.slice(0, 8)} ${i}?`,
        options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
        correctIndex: 0,
        explanation: `Because ${i}.`,
        difficulty: "medium",
        normalizedPrompt: normalizePrompt(`Seeded report question ${set.id} ${i}`),
        promptVersion: "seed",
      })),
    )
    .returning();
  return { set, items };
}

async function e2e(a: Session, b: Session) {
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Reports check" }).returning();
  const materialId = crypto.randomUUID();
  await db.insert(materials).values({ id: materialId, spaceId: space.id, originalName: "notes.pdf", blobPath: `check/${materialId}.pdf`, status: "ready" });
  const [chunk] = await db.insert(chunks).values({ materialId, spaceId: space.id, chunkIndex: 0, content: "Chunk text.", pageStart: 1, pageEnd: 1 }).returning();
  const [topic] = await db.insert(topics).values({ spaceId: space.id, name: "Reported topic", normalizedName: "reported topic", status: "confirmed", origin: "ai" }).returning();
  await db.insert(materialTopics).values({ spaceId: space.id, materialId, topicId: topic.id });

  // --- A 3-question quiz: submit with one wrong answer, then report it ---
  const { set, items } = await seedSet(space.id, chunk.id, topic.id, 3);
  await db.insert(itemSources).values(items.map((it) => ({ spaceId: space.id, itemId: it.id, chunkId: chunk.id })));

  let res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const started = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Attempt starts with topicName on each question while in progress", res.status === 201 && started.questions!.every((q) => typeof q.topicName === "string" && q.topicName === topic.name));

  // Answer question 0 wrong, the rest right.
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const q of started.questions!) {
    const item = byId.get(q.itemId)!;
    const correctText = item.options![item.correctIndex!];
    const correctDisplay = q.options.indexOf(correctText);
    const wrong = q.position === started.questions![0].position;
    await answerRoute(req(`/api/attempts/${started.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: wrong ? (correctDisplay + 1) % 4 : correctDisplay }), p({ id: started.id }));
  }
  res = await submitRoute(req(`/api/attempts/${started.id}/submit`, a, "POST"), p({ id: started.id }));
  const submitted = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("Submit: 2 of 3 correct, no report on any question yet", submitted.result?.score === 2 && submitted.result.questions.every((q) => q.report === null));
  const reportedItemId = submitted.result!.questions[0].itemId;
  const wrongItemId = submitted.result!.questions.find((q) => !q.isCorrect)!.itemId;

  // --- Ownership and validation --------------------------------------------------
  res = await reportRoute(req(`/api/items/${reportedItemId}/report`, b, "POST", { reason: "incorrect_answer", removeFromPractice: false }), p({ id: reportedItemId }));
  check("Report: another student's item → 404 ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ITEM_NOT_FOUND");
  res = await reportRoute(req(`/api/items/nope/report`, a, "POST", { reason: "incorrect_answer", removeFromPractice: false }), p({ id: "nope" }));
  check("Report: a malformed item id → 404 ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ITEM_NOT_FOUND");
  res = await reportRoute(req(`/api/items/${reportedItemId}/report`, a, "POST", { reason: "not_a_real_reason", removeFromPractice: false }), p({ id: reportedItemId }));
  check("Report: an invalid reason → 400 VALIDATION_ERROR", res.status === 400 && (await errorCode(res)) === "VALIDATION_ERROR");

  // --- Create, with removal, on the wrong question --------------------------------
  res = await reportRoute(req(`/api/items/${wrongItemId}/report`, a, "POST", { reason: "incorrect_answer", comment: "This looks wrong.", removeFromPractice: true }), p({ id: wrongItemId }));
  const report = (await res.json()) as { report: ReportResponse };
  check(
    "Report: 201 with the reason and removedFromPractice echoed back",
    res.status === 201 && report.report.itemId === wrongItemId && report.report.reason === "incorrect_answer" && report.report.removedFromPractice === true,
  );
  res = await reportRoute(req(`/api/items/${wrongItemId}/report`, a, "POST", { reason: "other", removeFromPractice: false }), p({ id: wrongItemId }));
  check("Report: a second report on the same question → 409 ITEM_ALREADY_REPORTED", res.status === 409 && (await errorCode(res)) === "ITEM_ALREADY_REPORTED");

  const row = (await db.select().from(learningItems).where(eq(learningItems.id, wrongItemId)))[0];
  check("Remove from my practice: the item's status is removed", row.status === "removed");

  // --- The earlier submitted result is unchanged, and now shows the report --------
  res = await attemptRoute(req(`/api/attempts/${started.id}`, a), p({ id: started.id }));
  const past = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check(
    "Past result: score unchanged, reported question now shows the report",
    past.result?.score === 2 && past.result.questions.find((q) => q.itemId === wrongItemId)?.report?.reason === "incorrect_answer",
  );

  // --- Mastery and mistakes: already filtered by status = 'active' ----------------
  res = await masteryRoute(req(`/api/topics/${topic.id}/mastery`, a), p({ id: topic.id }));
  const detail = (await res.json()) as TopicMasteryDetail;
  check(
    "Mastery: the removed question no longer counts or appears",
    detail.questions.every((q) => q.itemId !== wrongItemId) && detail.mastery.counted === 2,
    `${detail.mastery.counted}`,
  );
  res = await mistakesRoute(req(`/api/revision/mistakes?topicId=${topic.id}`, a));
  const mistakes = (await res.json()) as MistakesResponse;
  check("Mistakes: the removed question's mistake left the review list and its count", res.status === 200 && mistakes.items.length === 0 && mistakes.total === 0, `${mistakes.total}`);

  // --- Generation/new attempts exclude the removed item ----------------------------
  res = await startRoute(req(`/api/sets/${set.id}/attempts`, a, "POST"), p({ id: set.id }));
  const retake = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  check("A new attempt (retake) leaves the removed question out", res.status === 201 && !retake.questions!.some((q) => q.itemId === wrongItemId) && retake.questions!.length === 2);

  // --- SET_NO_ACTIVE_QUESTIONS: every question in a quiz reported and removed -----
  const single = await seedSet(space.id, chunk.id, topic.id, 1);
  await db.insert(itemSources).values({ spaceId: space.id, itemId: single.items[0].id, chunkId: chunk.id });
  res = await reportRoute(req(`/api/items/${single.items[0].id}/report`, a, "POST", { reason: "wrong_source", removeFromPractice: true }), p({ id: single.items[0].id }));
  check("Report the only question, removing it", res.status === 201);
  res = await startRoute(req(`/api/sets/${single.set.id}/attempts`, a, "POST"), p({ id: single.set.id }));
  check("Start on a quiz with every question removed → 409 SET_NO_ACTIVE_QUESTIONS", res.status === 409 && (await errorCode(res)) === "SET_NO_ACTIVE_QUESTIONS");

  const reportCount = (await db.select().from(contentReports).where(eq(contentReports.reporterId, a.userId))).length;
  check("Two reports recorded for this student (the second on the same question was rejected)", reportCount === 2, `${reportCount}`);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
