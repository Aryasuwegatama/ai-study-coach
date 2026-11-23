import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { attemptItems, attempts, jobs, learningItems, studySets, studySpaces } from "@/server/db/schema";
import * as sets from "@/app/api/sets/[id]/route";
import * as collection from "@/app/api/spaces/[spaceId]/sets/route";
import { POST as start } from "@/app/api/sets/[id]/attempts/route";
import { GET as read } from "@/app/api/attempts/[id]/route";
import { PATCH as save } from "@/app/api/attempts/[id]/answers/route";
import { POST as submit } from "@/app/api/attempts/[id]/submit/route";
import { studentRequest } from "../helpers/auth-test-students";
import { createQuizSecurityFixture } from "../helpers/quiz-security-fixture";

vi.mock("@/server/jobs/jobs-client", () => ({ publishStep: vi.fn() }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const spaceCtx = (spaceId: string) => ({ params: Promise.resolve({ spaceId }) });
function noKey(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(["correctIndex", "correctOption", "isCorrect", "explanation", "sources", "answerText", "keyPoints", "optionOrder"], `forbidden response key: ${key}`).not.toContain(key);
    noKey(child);
  }
  expect(JSON.stringify(value)).not.toContain("PRIVATE_EXPLANATION_CANARY");
}
describe("T-13 answer privacy and forged IDs (T-07a proposed IDs)", () => {
  let f: Awaited<ReturnType<typeof createQuizSecurityFixture>>;
  let setId: string;
  beforeEach(async () => { f = await createQuizSecurityFixture(); setId = (await f.set(f.spaceId, f.selected, true)).id; });
  afterEach(async () => { await f?.cleanup(); });
  const request = (path: string, method = "GET", body?: unknown, foreign = false) => studentRequest(path, method, foreign ? f.students.b.cookie : f.students.a.cookie, body);
  async function begin() {
    const response = await start(request(`/api/sets/${setId}/attempts`, "POST"), ctx(setId));
    expect(response.status).toBe(201);
    return (await response.json()).attempt;
  }
  it("SEC-ANSWER-01: set/list/start/read/autosave/resume expose no answer metadata", async () => {
    const detail = await sets.GET(request(`/api/sets/${setId}`), ctx(setId));
    expect(detail.status).toBe(200); const body = await detail.json(); noKey(body); expect(body.items).toHaveLength(5);
    const list = await collection.GET(request(`/api/spaces/${f.spaceId}/sets`), spaceCtx(f.spaceId));
    expect(list.status).toBe(200); noKey(await list.json());
    const attempt = await begin(); noKey(attempt); expect(attempt.result).toBeNull();
    const saved = await save(request(`/api/attempts/${attempt.id}/answers`, "PATCH", { itemId: attempt.questions[0].itemId, selectedIndex: 0, correctIndex: 0, isCorrect: true, explanation: "forged" }), ctx(attempt.id));
    expect(saved.status).toBe(200); noKey(await saved.json());
    const current = await read(request(`/api/attempts/${attempt.id}`), ctx(attempt.id));
    expect(current.status).toBe(200); noKey(await current.json());
    const resumed = await start(request(`/api/sets/${setId}/attempts`, "POST"), ctx(setId));
    expect(resumed.status).toBe(200); noKey(await resumed.json());
    const [stored] = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
    expect(stored.isCorrect).toBeNull();
  });
  it("SEC-ANSWER-01: answers appear only in the owner's submitted result", async () => {
    const attempt = await begin();
    const response = await submit(request(`/api/attempts/${attempt.id}/submit`, "POST"), ctx(attempt.id));
    expect(response.status).toBe(200); const done = (await response.json()).attempt;
    expect(done.status).toBe("submitted"); expect(done.result.questions).toHaveLength(5);
    expect(done.result.questions[0]).toMatchObject({ correctIndex: expect.any(Number), explanation: "PRIVATE_EXPLANATION_CANARY" });
    const denied = await read(request(`/api/attempts/${attempt.id}`, "GET", undefined, true), ctx(attempt.id));
    expect(denied.status).toBe(404); expect(JSON.stringify(await denied.json())).not.toContain("PRIVATE_EXPLANATION_CANARY");
    noKey(await (await sets.GET(request(`/api/sets/${setId}`), ctx(setId))).json());
  });
  it("SEC-OWNER-01: foreign/missing/malformed/empty set IDs have identical failures and no mutations", async () => {
    const [before] = await db.select().from(studySets).where(eq(studySets.id, setId));
    let expected: unknown;
    for (const id of [setId, randomUUID(), "invalid", ""]) for (const handler of [sets.GET, sets.DELETE, start]) {
      const response = await handler(request(`/api/sets/${id}`, "POST", undefined, true), ctx(id));
      expect(response.status).toBe(404); const body = await response.json(); expected ??= body; expect(body).toEqual(expected);
    }
    expect((await db.select().from(studySets).where(eq(studySets.id, setId)))[0]).toEqual(before);
    expect(await db.select().from(attempts).where(eq(attempts.setId, setId))).toEqual([]);
  });
  it("SEC-OWNER-01: foreign/missing/malformed/empty attempt IDs cannot read/save/submit", async () => {
    const attempt = await begin();
    const before = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
    let expected: unknown;
    for (const id of [attempt.id, randomUUID(), "invalid", ""]) for (const handler of [read, save, submit]) {
      const response = await handler(request(`/api/attempts/${id}`, "PATCH", { itemId: attempt.questions[0].itemId, selectedIndex: 0 }, true), ctx(id));
      expect(response.status).toBe(404); const body = await response.json(); expected ??= body; expect(body).toEqual(expected);
    }
    expect(await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id))).toEqual(before);
    expect((await db.select().from(attempts).where(eq(attempts.id, attempt.id)))[0].status).toBe("in_progress");
  });
  it("SEC-SCORE-02 / SEC-OWNER-01: same-space and cross-account item IDs cannot be saved into this attempt", async () => {
    const attempt = await begin();
    const otherSet = await f.set(f.spaceId, f.selected, true);
    const foreignSet = await f.set(f.foreignSpaceId, f.foreign, true);
    const before = await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id));
    for (const target of [otherSet.id, foreignSet.id]) {
      const [item] = await db.select().from(learningItems).where(eq(learningItems.setId, target));
      const response = await save(request(`/api/attempts/${attempt.id}/answers`, "PATCH", { itemId: item.id, selectedIndex: 0 }), ctx(attempt.id));
      expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("ITEM_NOT_IN_ATTEMPT");
    }
    expect(await db.select().from(attemptItems).where(eq(attemptItems.attemptId, attempt.id))).toEqual(before);
  });
  it("SEC-SPACE-05: deleting the parent blocks set and attempt reads and mutations", async () => {
    const attempt = await begin();
    await db.update(studySpaces).set({ deletedAt: new Date() }).where(eq(studySpaces.id, f.spaceId));
    for (const handler of [sets.GET, sets.DELETE, start]) expect((await handler(request("/api/sets/x", "POST"), ctx(setId))).status).toBe(404);
    for (const handler of [read, save, submit]) expect((await handler(request("/api/attempts/x", "PATCH", { itemId: attempt.questions[0].itemId, selectedIndex: 0 }), ctx(attempt.id))).status).toBe(404);
  });
  it.each(["foreign", "other", "unselected", "missing"] as const)("SEC-SOURCE-01: forged %s material/topic selection creates no set or job", async (kind) => {
    const target = kind === "missing" ? { materialId: randomUUID(), topic: { id: randomUUID() } } : f[kind];
    for (const input of [
      ...(kind === "unselected" ? [] : [{ materialIds: [target.materialId], topicIds: [f.selected.topic.id] }]),
      { materialIds: [f.selected.materialId], topicIds: [target.topic.id] },
    ]) {
      const response = await collection.POST(request(`/api/spaces/${f.spaceId}/sets`, "POST", { kind: "quiz", count: 5, ...input }), spaceCtx(f.spaceId));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(input.materialIds[0] === f.selected.materialId ? "TOPIC_NOT_IN_MATERIALS" : "MATERIAL_NOT_READY");
    }
    expect(await db.select().from(studySets).where(eq(studySets.spaceId, f.spaceId))).toHaveLength(1);
    expect(await db.select().from(jobs).where(eq(jobs.spaceId, f.spaceId))).toEqual([]);
  });
});
