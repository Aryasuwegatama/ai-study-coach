import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, jobs, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "@/server/db/schema";
import { embedTexts } from "@/server/ai/ai-embeddings";
import { createTestStudents } from "./auth-test-students";

export async function createQuizSecurityFixture() {
  const students = await createTestStudents();
  const spaceIds: string[] = [];
  async function cleanup() {
    // Jobs outlive users/spaces unless explicitly removed. Only this fixture's IDs.
    try { if (spaceIds.length) await db.delete(jobs).where(inArray(jobs.spaceId, spaceIds)); }
    finally { await students.cleanup(); }
  }
  async function source(spaceId: string, name: string, content = "Primary keys uniquely identify each database record.") {
    const id = randomUUID();
    await db.insert(materials).values({ id, spaceId, originalName: `${name}.txt`, blobPath: `security/${id}`, status: "ready" });
    const [topic] = await db.insert(topics).values({ spaceId, name, normalizedName: name.toLowerCase(), description: "Database primary keys", status: "confirmed", origin: "manual" }).returning();
    await db.insert(materialTopics).values({ spaceId, materialId: id, topicId: topic.id, pages: [1] });
    const { vectors } = await embedTexts([content], "RETRIEVAL_DOCUMENT");
    const saved = await db.insert(chunks).values([0, 1].map((chunkIndex) => ({ spaceId, materialId: id, chunkIndex, content: `${content} Section ${chunkIndex}.`, pageStart: 1, pageEnd: 1, embedding: vectors[0], embeddingModel: "fake-hashed-words" }))).returning();
    return { materialId: id, topic, chunks: saved };
  }
  async function set(spaceId: string, selected: Awaited<ReturnType<typeof source>>, ready = false) {
    const [row] = await db.insert(studySets).values({ spaceId, kind: "quiz", title: "Synthetic private quiz", materialIds: [selected.materialId], topicIds: [selected.topic.id], requestedCount: 5, status: ready ? "ready" : "generating", generatedCount: ready ? 5 : 0 }).returning();
    if (ready) await db.insert(learningItems).values(Array.from({ length: 5 }, (_, position) => ({ setId: row.id, spaceId, topicId: selected.topic.id, kind: "mcq", position, prompt: `Synthetic question ${position}?`, options: ["Unique", "Duplicate", "Missing", "Unrelated"], correctIndex: position % 4, explanation: "PRIVATE_EXPLANATION_CANARY", normalizedPrompt: `synthetic${row.id}${position}`, promptVersion: "security-fixture" })));
    return row;
  }
  try {
    for (const ownerId of [students.a.user.id, students.a.user.id, students.b.user.id]) {
      const [space] = await db.insert(studySpaces).values({ ownerId, name: "Synthetic quiz security" }).returning();
      spaceIds.push(space.id);
    }
    const [spaceId, otherSpaceId, foreignSpaceId] = spaceIds;
    const selected = await source(spaceId, "Keys");
    const unselected = await source(spaceId, "Unselected", "UNSELECTED_SOURCE_CANARY Primary keys.");
    const other = await source(otherSpaceId, "Other", "OTHER_SPACE_CANARY Primary keys.");
    const foreign = await source(foreignSpaceId, "Foreign", "FOREIGN_SOURCE_CANARY Primary keys.");
    return { students, spaceId, otherSpaceId, foreignSpaceId, selected, unselected, other, foreign, source, set,
      cleanup,
      async claim(setId: string, step: string, payload?: unknown) {
        const [job] = await db.insert(jobs).values({ userId: students.a.user.id, spaceId, kind: "generate_quiz", targetId: setId, step, payload, status: "running", claimToken: randomUUID(), idempotencyKey: `security:${randomUUID()}` }).returning();
        return job;
      },
      async next(jobId: string) {
        const [job] = await db.update(jobs).set({ status: "running", claimToken: randomUUID() }).where(eq(jobs.id, jobId)).returning();
        return job;
      },
    };
  } catch (error) { await cleanup(); throw error; }
}
