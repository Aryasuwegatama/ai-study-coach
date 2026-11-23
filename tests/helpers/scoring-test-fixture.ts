import { randomUUID } from "node:crypto";
import { db } from "@/server/db/db-client";
import { chunks, itemSources, learningItems, materials, studySets, studySpaces, topics } from "@/server/db/schema";
import { requireUser } from "@/server/auth/auth-session";
import { POST as startRoute } from "@/app/api/sets/[id]/attempts/route";
import { PATCH as saveRoute } from "@/app/api/attempts/[id]/answers/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { createTestStudents, studentRequest } from "./auth-test-students";

export const scoringContext = (id: string) => ({ params: Promise.resolve({ id }) });
export async function createScoringFixture() {
  const students = await createTestStudents();
  async function course(ownerId: string) {
    const [space] = await db.insert(studySpaces).values({ ownerId, name: "Synthetic scoring security" }).returning();
    const materialId = randomUUID();
    await db.insert(materials).values({ id: materialId, spaceId: space.id, originalName: "synthetic.txt", blobPath: `security/${materialId}`, status: "ready" });
    const [topic] = await db.insert(topics).values({ spaceId: space.id, name: "Scoring", normalizedName: "scoring", origin: "manual", status: "confirmed" }).returning();
    const [chunk] = await db.insert(chunks).values({ spaceId: space.id, materialId, chunkIndex: 0, content: "Synthetic source for quiz scoring tests.", pageStart: 1, pageEnd: 1 }).returning();
    return { spaceId: space.id, topicId: topic.id, materialId, chunkId: chunk.id };
  }
  try {
    const own = await course(students.a.user.id);
    const foreign = await course(students.b.user.id);
    const request = (path: string, method = "GET", body?: unknown, asB = false) => studentRequest(path, method, asB ? students.b.cookie : students.a.cookie, body);
    return { students, own, foreign, request, cleanup: students.cleanup,
      user: await requireUser(request("/api/progress")),
      async quiz(target = own) {
        const [set] = await db.insert(studySets).values({ spaceId: target.spaceId, kind: "quiz", title: "Synthetic scoring quiz", materialIds: [target.materialId], topicIds: [target.topicId], requestedCount: 5, generatedCount: 5, status: "ready" }).returning();
        const items = await db.insert(learningItems).values(Array.from({ length: 5 }, (_, position) => ({ setId: set.id, spaceId: target.spaceId, topicId: target.topicId, kind: "mcq", position, prompt: `Scoring question ${position}`, options: ["Alpha", "Bravo", "Charlie", "Delta"], correctIndex: position % 4, explanation: "SCORING_EXPLANATION_CANARY", normalizedPrompt: `scoring${set.id}${position}`, promptVersion: "scoring-test" }))).returning();
        await db.insert(itemSources).values(items.map((item) => ({ spaceId: target.spaceId, itemId: item.id, chunkId: target.chunkId })));
        return { set, items };
      },
      async start(setId: string, asB = false) {
        const response = await startRoute(request(`/api/sets/${setId}/attempts`, "POST", undefined, asB), scoringContext(setId));
        if (!response.ok) throw new Error(`Synthetic start failed: ${response.status}`);
        return (await response.json()).attempt as { id: string; questions: { itemId: string; options: string[]; selectedIndex: number | null }[] };
      },
      save(attemptId: string, itemId: string, selectedIndex: number | null, extra = {}) {
        return saveRoute(request(`/api/attempts/${attemptId}/answers`, "PATCH", { itemId, selectedIndex, ...extra }), scoringContext(attemptId));
      },
      submit(attemptId: string, body = {}) {
        return submitRoute(request(`/api/attempts/${attemptId}/submit`, "POST", body), scoringContext(attemptId));
      },
    };
  } catch (error) { await students.cleanup(); throw error; }
}
