import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { attemptItems, attempts, itemSources, learningItems, revisionEvents, revisionItems, studySpaces, topics } from "@/server/db/schema";
import { masteryFor } from "@/features/progress/server";
import { POST as checkRoute } from "@/app/api/revision/items/[id]/check/route";
import { GET as listRoute } from "@/app/api/revision/mistakes/route";
import { createScoringFixture, scoringContext } from "../helpers/scoring-test-fixture";

describe("T-16: mistakes ownership, request keys and mastery isolation", () => {
  let f: Awaited<ReturnType<typeof createScoringFixture>>;
  let quiz: Awaited<ReturnType<Awaited<ReturnType<typeof createScoringFixture>>["quiz"]>>;
  let attemptId: string;
  let mistake: typeof revisionItems.$inferSelect;
  let correct: number;
  beforeEach(async () => {
    f = await createScoringFixture(); quiz = await f.quiz(); const attempt = await f.start(quiz.set.id); attemptId = attempt.id;
    const item = quiz.items[0]; correct = item.correctIndex!;
    const [row] = await db.select().from(attemptItems).where(eq(attemptItems.itemId, item.id));
    expect((await f.save(attempt.id, item.id, row.optionOrder.indexOf((correct + 1) % 4))).status).toBe(200);
    expect((await f.submit(attempt.id)).status).toBe(200);
    [mistake] = await db.select().from(revisionItems).where(eq(revisionItems.itemId, item.id));
    expect(mistake).toBeDefined();
  });
  afterEach(async () => { await f?.cleanup(); });
  const wrong = () => (correct + 1) % 4;
  const check = (id: string, selectedIndex: unknown, requestKey: unknown = randomUUID(), asB = false, extra = {}) => checkRoute(f.request(`/api/revision/items/${id}/check`, "POST", { selectedIndex, requestKey, ...extra }, asB), scoringContext(id));
  const list = (scope = `spaceId=${f.own.spaceId}`, asB = false) => listRoute(f.request(`/api/revision/mistakes?${scope}`, "GET", undefined, asB));
  const events = (id = mistake.id) => db.select().from(revisionEvents).where(eq(revisionEvents.revisionItemId, id));
  const current = async () => (await db.select().from(revisionItems).where(eq(revisionItems.id, mistake.id)))[0];
  it("SEC-ANSWER-01 / SEC-REVISION-01: list hides answer metadata, owner check returns an answer and clears only that mistake", async () => {
    const response = await list(); expect(response.status).toBe(200); const body = await response.json();
    expect(body.total).toBe(1); expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0]).sort()).toEqual(["id", "options", "prompt", "topicId", "topicName"]);
    expect(JSON.stringify(body)).not.toContain("SCORING_EXPLANATION_CANARY");
    const reply = await check(mistake.id, correct, randomUUID(), false, { outcome: "incorrect", cleared: false, studentId: f.students.b.user.id });
    expect(reply.status).toBe(200);
    expect((await reply.json()).result).toMatchObject({ outcome: "correct", correctIndex: correct, explanation: "SCORING_EXPLANATION_CANARY", cleared: true });
    expect((await current()).clearedAt).not.toBeNull(); expect(await events()).toHaveLength(1);
    expect((await (await list()).json()).total).toBe(0);
  });
  it("SEC-REVISION-01: repeated key with a different answer preserves first outcome and event", async () => {
    const key = randomUUID(); const first = await check(mistake.id, wrong(), key); expect(first.status).toBe(200); const body = await first.json();
    expect(body.result).toMatchObject({ outcome: "incorrect", cleared: false }); const before = await current();
    const duplicate = await check(mistake.id, correct, key); expect(duplicate.status).toBe(200); expect(await duplicate.json()).toEqual(body);
    expect(await events()).toHaveLength(1); expect((await events())[0]).toMatchObject({ selectedIndex: wrong(), outcome: "incorrect" });
    expect(await current()).toEqual(before);
  });
  it("SEC-REVISION-01: concurrent changed-answer requests sharing one key create one consistent result", async () => {
    const key = randomUUID(); const replies = await Promise.all([check(mistake.id, correct, key), check(mistake.id, wrong(), key), check(mistake.id, correct, key)]);
    expect(replies.every((r) => r.status === 200)).toBe(true);
    const bodies = await Promise.all(replies.map((r) => r.json())); for (const body of bodies) expect(body).toEqual(bodies[0]);
    const saved = await events(); expect(saved).toHaveLength(1);
    expect(saved[0].outcome).toBe(bodies[0].result.outcome);
    expect(saved[0].outcome === "correct").toBe((await current()).clearedAt !== null);
  });
  it("SEC-REVISION-01: wrong check stays open; later correct clears; subsequent wrong check cannot reopen", async () => {
    expect((await (await check(mistake.id, wrong())).json()).result).toMatchObject({ outcome: "incorrect", cleared: false });
    expect((await current()).clearedAt).toBeNull();
    expect((await (await check(mistake.id, correct)).json()).result).toMatchObject({ outcome: "correct", cleared: true });
    const cleared = (await current()).clearedAt;
    expect((await (await check(mistake.id, wrong())).json()).result).toMatchObject({ outcome: "incorrect", cleared: true });
    expect((await current()).clearedAt).toEqual(cleared); expect(await events()).toHaveLength(3);
  });
  it("SEC-REVISION-01 / SEC-SCORE-03: reviews cannot change submitted answers, scores or mastery evidence", async () => {
    const beforeItems = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attemptId));
    const beforeAttempt = await db.select().from(attempts).where(eq(attempts.id, attemptId));
    const beforeMastery = await masteryFor(f.user.id, [{ id: f.own.topicId, name: "Scoring" }]);
    expect(beforeMastery[0]).toMatchObject({ counted: 1, correct: 0 });
    expect((await check(mistake.id, wrong())).status).toBe(200);
    expect((await check(mistake.id, correct)).status).toBe(200);
    expect(await events()).toHaveLength(2);
    expect(await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attemptId))).toEqual(beforeItems);
    expect(await db.select().from(attempts).where(eq(attempts.id, attemptId))).toEqual(beforeAttempt);
    expect(await masteryFor(f.user.id, [{ id: f.own.topicId, name: "Scoring" }])).toEqual(beforeMastery);
  });
  it("SEC-REVISION-01: later quiz answers reopen/clear the same mistake without duplicate rows", async () => {
    expect((await check(mistake.id, correct)).status).toBe(200);
    expect((await current()).clearedAt).not.toBeNull();
    for (const [answer, cleared] of [[wrong(), false], [correct, true]] as const) {
      const next = await f.start(quiz.set.id);
      const [row] = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, next.id)).then((rows) => rows.filter((r) => r.itemId === quiz.items[0].id));
      expect((await f.save(next.id, row.itemId, row.optionOrder.indexOf(answer))).status).toBe(200);
      expect((await f.submit(next.id)).status).toBe(200);
      const saved = await db.select().from(revisionItems).where(eq(revisionItems.itemId, row.itemId));
      expect(saved).toHaveLength(1); expect(saved[0].id).toBe(mistake.id); expect(saved[0].clearedAt !== null).toBe(cleared);
    }
  });
  it("SEC-REVISION-01 / SEC-OWNER-01: foreign/missing/malformed/empty IDs give identical errors and no events", async () => {
    const key = randomUUID(); await check(mistake.id, wrong(), key); const before = await current(); const beforeEvents = await events();
    let expected: unknown;
    for (const id of [mistake.id, randomUUID(), "malformed", ""]) {
      const response = await check(id, correct, key, true);
      expect(response.status).toBe(404); const body = await response.json(); expected ??= body; expect(body).toEqual(expected);
      expect(JSON.stringify(body)).not.toContain("SCORING_EXPLANATION_CANARY");
    }
    expect(await current()).toEqual(before); expect(await events()).toEqual(beforeEvents);
    expect((await list(undefined, true)).status).toBe(404);
    expect((await list(`topicId=${f.own.topicId}`, true)).status).toBe(404);
  });
  it("SEC-REVISION-01: a shared key is scoped to the item, never another student's cached result", async () => {
    const foreignQuiz = await f.quiz(f.foreign); const other = foreignQuiz.items[0];
    const [foreignMistake] = await db.insert(revisionItems).values({ studentId: f.students.b.user.id, spaceId: f.foreign.spaceId, topicId: f.foreign.topicId, itemId: other.id }).returning();
    const key = randomUUID(); expect((await check(mistake.id, wrong(), key)).status).toBe(200);
    const ownBefore = await events();
    const reply = await check(foreignMistake.id, other.correctIndex, key, true);
    expect(reply.status).toBe(200); expect((await reply.json()).result.outcome).toBe("correct");
    expect(await events(foreignMistake.id)).toHaveLength(1); expect(await events()).toEqual(ownBefore);
    expect((await check(mistake.id, correct, key, true)).status).toBe(404);
  });
  it("SEC-REVISION-01: invalid keys/answers and scope queries are rejected without writes", async () => {
    for (const [index, key] of [[correct, "short"], [correct, "x".repeat(101)], [correct, null], [-1, randomUUID()], [4, randomUUID()], [1.5, randomUUID()], [null, randomUUID()], ["0", randomUUID()]] as const) {
      const response = await check(mistake.id, index, key); expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
    for (const scope of ["", "spaceId=invalid", `spaceId=${f.own.spaceId}&topicId=${f.own.topicId}`]) expect((await list(scope)).status).toBe(400);
    expect(await events()).toEqual([]); expect(await current()).toEqual(mistake);
  });
  it("SEC-REVISION-01: distinct valid request keys at both length boundaries each record a new check", async () => {
    for (const key of ["boundary", "x".repeat(100)]) {
      const reply = await check(mistake.id, wrong(), key); expect(reply.status).toBe(200);
      expect((await reply.json()).result).toMatchObject({ outcome: "incorrect", cleared: false });
    }
    expect(await events()).toHaveLength(2); expect((await current()).clearedAt).toBeNull();
  });
  it.each(["removed item", "archived topic", "missing source", "deleted space"])("SEC-REVISION-01: %s makes the mistake ineligible with no review writes", async (kind) => {
    if (kind === "removed item") await db.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, mistake.itemId));
    if (kind === "archived topic") await db.update(topics).set({ status: "archived" }).where(eq(topics.id, f.own.topicId));
    if (kind === "missing source") await db.delete(itemSources).where(eq(itemSources.itemId, mistake.itemId));
    if (kind === "deleted space") await db.update(studySpaces).set({ deletedAt: new Date() }).where(eq(studySpaces.id, f.own.spaceId));
    const response = await check(mistake.id, correct); expect(response.status).toBe(404); expect((await response.json()).error.code).toBe("REVISION_ITEM_NOT_FOUND");
    const listing = await list();
    if (kind === "deleted space") expect(listing.status).toBe(404);
    else { expect(listing.status).toBe(200); expect(await listing.json()).toEqual({ items: [], total: 0 }); }
    expect(await events()).toEqual([]); expect(await current()).toEqual(mistake);
  });
});
