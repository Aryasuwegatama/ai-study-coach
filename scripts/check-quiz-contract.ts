#!/usr/bin/env tsx
/**
 * Verifies the T-11a quiz contract: request validation, the even spread,
 * the duplicate-prompt normaliser, and the database rules that keep items
 * and sources inside one Study Space (PRD Section 4, "Cross-space
 * integrity is a database requirement").
 *
 * Run with: pnpm run check:quiz-contract
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { chunks, itemSources, learningItems, materials, studySets, studySpaces, topics } from "../src/server/db/schema";
import { createQuizSchema, normalizePrompt, spreadQuestions } from "../src/features/quizzes/quizzes-schemas";

const results: { name: string; ok: boolean; message: string }[] = [];
const check = (name: string, ok: boolean, message = "") => results.push({ name, ok, message });

async function rejects(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const id = () => crypto.randomUUID();
  const ok = createQuizSchema.safeParse({ kind: "quiz", materialIds: [id()], topicIds: [id(), id()], count: 10, ownerId: "x" });
  check("Valid request parses; stray ownerId is stripped", ok.success && !("ownerId" in ok.data));
  check("Count must be 5, 10, 15 or 20", !createQuizSchema.safeParse({ kind: "quiz", materialIds: [id()], topicIds: [id()], count: 7 }).success);
  check("Decks are not accepted yet", !createQuizSchema.safeParse({ kind: "deck", materialIds: [id()], topicIds: [id()], count: 5 }).success);
  check("No materials is invalid", !createQuizSchema.safeParse({ kind: "quiz", materialIds: [], topicIds: [id()], count: 5 }).success);
  const same = id();
  const deduped = createQuizSchema.safeParse({ kind: "quiz", materialIds: [same, same.toUpperCase()], topicIds: [id()], count: 5 });
  check("Repeated ids collapse", deduped.success && deduped.data.materialIds.length === 1);
  check("Spread: 10 over 3 topics is 4,3,3", spreadQuestions(10, 3).join(",") === "4,3,3");
  check("Spread: 5 over 5 topics is 1 each", spreadQuestions(5, 5).join(",") === "1,1,1,1,1");
  check("Normalised prompt ignores case and punctuation", normalizePrompt("What is a PRIMARY key?") === normalizePrompt("what is a primary  key"));

  const test = (await buildTestAuth().$context).test;
  const user = await test.saveUser(test.createUser({ email: `check-quiz-contract-${Date.now()}@example.com`, name: "Quiz contract", role: "student" }));
  try {
    const spaces = await db.insert(studySpaces).values([{ ownerId: user.id, name: "One" }, { ownerId: user.id, name: "Two" }]).returning();
    const [s1, s2] = spaces;
    const mat = async (spaceId: string) =>
      (await db.insert(materials).values({ id: id(), spaceId, originalName: "a.txt", blobPath: `check/${id()}.txt`, status: "ready" }).returning())[0];
    const m1 = await mat(s1.id);
    const m2 = await mat(s2.id);
    const [c1] = await db.insert(chunks).values({ materialId: m1.id, spaceId: s1.id, chunkIndex: 0, content: "x", pageStart: 1, pageEnd: 1 }).returning();
    const [c2] = await db.insert(chunks).values({ materialId: m2.id, spaceId: s2.id, chunkIndex: 0, content: "y", pageStart: 1, pageEnd: 1 }).returning();
    const topic = async (spaceId: string) =>
      (await db.insert(topics).values({ spaceId, name: "Keys", normalizedName: "keys", status: "confirmed", origin: "ai" }).returning())[0];
    const t1 = await topic(s1.id);
    const t2 = await topic(s2.id);
    const [set1] = await db
      .insert(studySets)
      .values({ spaceId: s1.id, kind: "quiz", title: "Q", materialIds: [m1.id], topicIds: [t1.id], requestedCount: 5 })
      .returning();
    const item = (over: Partial<typeof learningItems.$inferInsert>) =>
      db
        .insert(learningItems)
        .values({
          setId: set1.id,
          spaceId: s1.id,
          topicId: t1.id,
          kind: "mcq",
          position: 0,
          prompt: "What is a key?",
          options: ["a", "b", "c", "d"],
          correctIndex: 1,
          normalizedPrompt: "what is a key",
          promptVersion: "quiz-v1",
          ...over,
        })
        .returning();

    const [good] = await item({});
    check("A well-formed MCQ inserts", Boolean(good));
    check("MCQ with 3 options is rejected by the database", await rejects(item({ position: 1, options: ["a", "b", "c"] })));
    check("MCQ with correct index 4 is rejected", await rejects(item({ position: 2, correctIndex: 4 })));
    check("Item tagged with another space's topic is rejected", await rejects(item({ position: 3, topicId: t2.id })));
    check("Item claiming another space for its set is rejected", await rejects(item({ position: 4, spaceId: s2.id, topicId: t2.id })));
    check("Source in the same space inserts", !(await rejects(db.insert(itemSources).values({ spaceId: s1.id, itemId: good.id, chunkId: c1.id }))));
    check("Source chunk from another space is rejected", await rejects(db.insert(itemSources).values({ spaceId: s1.id, itemId: good.id, chunkId: c2.id })));
    check("Mislabelled source space is rejected", await rejects(db.insert(itemSources).values({ spaceId: s2.id, itemId: good.id, chunkId: c2.id })));

    await db.delete(materials).where(eq(materials.id, m1.id));
    const left = await db.select().from(itemSources).where(eq(itemSources.itemId, good.id));
    const stillThere = await db.select().from(learningItems).where(eq(learningItems.id, good.id));
    check("Deleting the material removes its source links; the item stays (Source removed)", left.length === 0 && stillThere.length === 1);
  } finally {
    await test.deleteUser(user.id);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
