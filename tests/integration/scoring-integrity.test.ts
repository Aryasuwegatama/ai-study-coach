import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { attemptItems, attempts, revisionItems } from "@/server/db/schema";
import { POST as startRoute } from "@/app/api/sets/[id]/attempts/route";
import { createScoringFixture, scoringContext } from "../helpers/scoring-test-fixture";

describe("T-16: scoring and submission integrity", () => {
  let f: Awaited<ReturnType<typeof createScoringFixture>>;
  beforeEach(async () => { f = await createScoringFixture(); });
  afterEach(async () => { await f?.cleanup(); });
  async function rows(attemptId: string) { return db.select().from(attemptItems).where(eq(attemptItems.attemptId, attemptId)); }
  it("SEC-SCORE-01: forged scores/identity/correctness cannot override displayed-index scoring", async () => {
    const quiz = await f.quiz(); const attempt = await f.start(quiz.set.id);
    // Guarantee a non-identity permutation, rather than relying on random shuffles.
    await db.update(attemptItems).set({ optionOrder: [2, 0, 3, 1] }).where(eq(attemptItems.attemptId, attempt.id));
    for (const [i, item] of quiz.items.entries()) {
      const original = i === 0 || i === 3 ? item.correctIndex! : (item.correctIndex! + 1) % 4;
      const response = await f.save(attempt.id, item.id, i === 2 ? null : [2, 0, 3, 1].indexOf(original), { score: 100, isCorrect: true, studentId: f.students.b.user.id, correctIndex: 99, optionOrder: [0, 1, 2, 3] });
      expect(response.status).toBe(200);
    }
    const response = await f.submit(attempt.id, { score: 100, total: 1, isCorrect: true, studentId: f.students.b.user.id, userId: f.students.b.user.id });
    expect(response.status).toBe(200);
    expect((await response.json()).attempt.result).toMatchObject({ score: 2, total: 5, percent: 40 });
    const [stored] = await db.select().from(attempts).where(eq(attempts.id, attempt.id));
    expect(stored).toMatchObject({ studentId: f.students.a.user.id, score: 2, total: 5, status: "submitted" });
    const saved = await rows(attempt.id);
    expect(saved.filter((r) => r.isCorrect)).toHaveLength(2);
    expect(saved.find((r) => r.itemId === quiz.items[2].id)).toMatchObject({ selectedIndex: null, isCorrect: false });
    for (const row of saved) expect(row.optionOrder).toEqual([2, 0, 3, 1]);
    expect(await db.select().from(revisionItems).where(eq(revisionItems.studentId, f.students.a.user.id))).toHaveLength(2);
    expect(await db.select().from(revisionItems).where(eq(revisionItems.studentId, f.students.b.user.id))).toEqual([]);
  });
  it("SEC-SCORE-01: clearing an answer restores null and unanswered submission scores zero with no mistakes", async () => {
    const quiz = await f.quiz(); const attempt = await f.start(quiz.set.id);
    expect((await f.save(attempt.id, quiz.items[0].id, 0)).status).toBe(200);
    expect((await f.save(attempt.id, quiz.items[0].id, null)).status).toBe(200);
    const response = await f.submit(attempt.id, { score: 5 });
    expect((await response.json()).attempt.result).toMatchObject({ score: 0, total: 5 });
    expect((await rows(attempt.id)).every((r) => r.selectedIndex === null && r.answeredAt === null && r.isCorrect === false)).toBe(true);
    expect(await db.select().from(revisionItems).where(eq(revisionItems.studentId, f.students.a.user.id))).toEqual([]);
  });
  it.each(["same-space", "foreign-account"])("SEC-SCORE-02: rejects %s quiz item in API and database without changing attempt", async (kind) => {
    const quiz = await f.quiz(); const other = await f.quiz(kind === "same-space" ? f.own : f.foreign); const attempt = await f.start(quiz.set.id);
    const before = await rows(attempt.id);
    const response = await f.save(attempt.id, other.items[0].id, 0);
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("ITEM_NOT_IN_ATTEMPT");
    await expect(db.insert(attemptItems).values({ attemptId: attempt.id, spaceId: f.own.spaceId, setId: quiz.set.id, itemId: other.items[0].id, position: 99, optionOrder: [0, 1, 2, 3] })).rejects.toMatchObject({ cause: { code: "23503" } });
    expect(await rows(attempt.id)).toEqual(before);
  });
  it("SEC-SCORE-03: parallel starts create one in-progress attempt and one item snapshot", async () => {
    const quiz = await f.quiz();
    const results = await Promise.all(Array.from({ length: 3 }, () => startRoute(f.request(`/api/sets/${quiz.set.id}/attempts`, "POST"), scoringContext(quiz.set.id))));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((b) => b.attempt.id)).size).toBe(1);
    expect(await db.select().from(attempts).where(eq(attempts.setId, quiz.set.id))).toHaveLength(1);
    expect(await rows(bodies[0].attempt.id)).toHaveLength(5);
  });
  it("SEC-SCORE-03: repeated/parallel submit returns one stored result and one mistake per wrong item", async () => {
    const quiz = await f.quiz(); const attempt = await f.start(quiz.set.id);
    const [row] = await rows(attempt.id); const key = quiz.items.find((i) => i.id === row.itemId)!.correctIndex!;
    expect((await f.save(attempt.id, row.itemId, row.optionOrder.indexOf((key + 1) % 4))).status).toBe(200);
    const replies = await Promise.all([f.submit(attempt.id, { score: 100 }), f.submit(attempt.id), f.submit(attempt.id)]);
    expect(replies.every((r) => r.status === 200)).toBe(true);
    const bodies = await Promise.all(replies.map((r) => r.json()));
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    const again = await f.submit(attempt.id); expect(await again.json()).toEqual(bodies[0]);
    expect(await db.select().from(revisionItems).where(eq(revisionItems.studentId, f.students.a.user.id))).toHaveLength(1);
    const before = await rows(attempt.id);
    const denied = await f.save(attempt.id, row.itemId, 0);
    expect(denied.status).toBe(409); expect((await denied.json()).error.code).toBe("ATTEMPT_SUBMITTED");
    expect(await rows(attempt.id)).toEqual(before);
  });
  it("SEC-SCORE-03: autosave racing submit leaves a score consistent with immutable stored answers", async () => {
    const quiz = await f.quiz(); const attempt = await f.start(quiz.set.id);
    const [row] = await rows(attempt.id); const correct = quiz.items.find((i) => i.id === row.itemId)!.correctIndex!;
    const [save, submit] = await Promise.all([f.save(attempt.id, row.itemId, row.optionOrder.indexOf(correct)), f.submit(attempt.id)]);
    expect([200, 409]).toContain(save.status); expect(submit.status).toBe(200);
    const current = await rows(attempt.id); const expected = current.filter((r) => r.selectedIndex === quiz.items.find((i) => i.id === r.itemId)!.correctIndex).length;
    const [stored] = await db.select().from(attempts).where(eq(attempts.id, attempt.id));
    expect(stored).toMatchObject({ status: "submitted", score: expected });
    for (const item of current) expect(item.isCorrect).toBe(item.selectedIndex === quiz.items.find((i) => i.id === item.itemId)!.correctIndex);
    const before = await rows(attempt.id); expect((await f.save(attempt.id, row.itemId, 1)).status).toBe(409); expect(await rows(attempt.id)).toEqual(before);
  });
  it("SEC-SCORE-02: foreign attempt mutation cannot affect its owner's answers or result", async () => {
    const quiz = await f.quiz(f.foreign); const attempt = await f.start(quiz.set.id, true); const before = await rows(attempt.id);
    expect((await f.save(attempt.id, quiz.items[0].id, 0)).status).toBe(404);
    expect((await f.submit(attempt.id, { studentId: f.students.b.user.id, score: 100 })).status).toBe(404);
    expect(await rows(attempt.id)).toEqual(before);
    expect((await db.select().from(attempts).where(and(eq(attempts.id, attempt.id), eq(attempts.studentId, f.students.b.user.id))))[0].status).toBe("in_progress");
  });
  it("SEC-SCORE-01: malformed displayed answers are rejected before any row changes", async () => {
    const quiz = await f.quiz(); const attempt = await f.start(quiz.set.id); const before = await rows(attempt.id);
    for (const selectedIndex of [-1, 4, 1.5, "0", {}, undefined]) {
      const response = await f.save(attempt.id, quiz.items[0].id, null, { selectedIndex });
      expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(await rows(attempt.id)).toEqual(before);
  });
});
