import "../helpers/materials-fake-storage";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import {
  chunks,
  materialTopics,
  materials,
  studySpaces,
  topics,
} from "@/server/db/schema";
import { searchChunks } from "@/features/materials/server";
import { requireSpace } from "@/server/auth/auth-space-access";
import { embeddingModelName } from "@/server/ai/ai-embeddings";
import { PUT as saveDraft } from "@/app/api/materials/[id]/topic-draft/route";
import { PATCH as updateTopic } from "@/app/api/topics/[id]/route";
import {
  createMaterialsFixture,
  materialContext,
  materialRequest,
} from "../helpers/materials-integration-fixture";

describe("T-10 cross-space source isolation", () => {
  let f: Awaited<ReturnType<typeof createMaterialsFixture>> | undefined;
  beforeEach(async () => {
    f = await createMaterialsFixture();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await f?.cleanup();
    f = undefined;
  });
  async function seedMaterial(spaceId: string) {
    const id = randomUUID();
    const [row] = await db
      .insert(materials)
      .values({
        id,
        spaceId,
        originalName: "synthetic.txt",
        blobPath: `t10/${id}`,
        status: "ready",
      })
      .returning();
    return row;
  }
  async function seedTopic(spaceId: string) {
    const id = randomUUID();
    const [row] = await db
      .insert(topics)
      .values({
        spaceId,
        name: `Synthetic ${id.slice(0, 8)}`,
        normalizedName: id,
        origin: "manual",
        status: "confirmed",
      })
      .returning();
    return row;
  }
  const vector = (x: number, y: number) => [
    x,
    y,
    ...new Array<number>(766).fill(0),
  ];

  it("SEC-RAG-01: foreign nearest vectors and unselected materials are excluded in the retrieval SQL", async () => {
    const own = await seedMaterial(f!.aSpace.id),
      unselected = await seedMaterial(f!.aSpace.id),
      other = await seedMaterial(f!.aOther.id),
      foreign = await seedMaterial(f!.bSpace.id);
    const seeded = await db
      .insert(chunks)
      .values(
        [own, unselected, other, foreign].map((material, index) => ({
          materialId: material.id,
          spaceId: material.spaceId,
          chunkIndex: 0,
          content: `Synthetic source ${index}`,
          pageStart: 1,
          pageEnd: 1,
          embedding: index === 0 ? vector(0.8, 0.6) : vector(1, 0),
          embeddingModel: embeddingModelName(),
        })),
      )
      .returning();
    const querySpy = vi.spyOn(global.__dbPool!, "query");
    const result = await searchChunks({
      spaceId: own.spaceId,
      materialIds: [own.id, other.id, foreign.id],
      queryVector: vector(1, 0),
      limit: 10,
    });
    expect(result.map((row) => row.id)).toEqual([seeded[0].id]);
    const statements = querySpy.mock.calls as unknown as [
      string | { text?: string },
      unknown[],
    ][];
    const query = statements.find(([entry]) =>
      (typeof entry === "string" ? entry : (entry.text ?? "")).includes(
        'from "chunks"',
      ),
    );
    expect(query).toBeDefined();
    const sqlText = typeof query![0] === "string" ? query![0] : query![0].text!;
    expect(sqlText).toMatch(/where [\s\S]*"chunks"\."space_id"\s*=/);
    expect(sqlText).toContain('"chunks"."material_id" in');
    expect(query![1]).toContain(own.spaceId);
    expect(
      await searchChunks({
        spaceId: own.spaceId,
        materialIds: [],
        queryVector: vector(1, 0),
        limit: 10,
      }),
    ).toEqual([]);
  });

  it("SEC-SOURCE-01: composite FKs reject cross-space chunks and material/topic links even for the same owner", async () => {
    const material = await seedMaterial(f!.aSpace.id);
    for (const spaceId of [f!.aOther.id, f!.bSpace.id]) {
      const topic = await seedTopic(spaceId);
      await expect(
        db.insert(chunks).values({
          materialId: material.id,
          spaceId,
          chunkIndex: 0,
          content: "Synthetic rejected chunk",
          pageStart: 1,
          pageEnd: 1,
        }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(
        db.insert(materialTopics).values({
          materialId: material.id,
          spaceId: material.spaceId,
          topicId: topic.id,
          pages: [1],
        }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
    }
  });

  it("SEC-OWNER-01: foreign topic updates get the same 404 as missing or malformed topics", async () => {
    const topic = await seedTopic(f!.aSpace.id);
    for (const id of [topic.id, randomUUID(), "not-a-uuid"]) {
      const response = await updateTopic(
        materialRequest(`/api/topics/${id}`, "PATCH", f!.b.cookie, {
          name: "Hijacked",
        }),
        materialContext(id),
      );
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("TOPIC_NOT_FOUND");
    }
    expect(
      (await db.select().from(topics).where(eq(topics.id, topic.id)))[0],
    ).toEqual(topic);
  });

  it("SEC-SOURCE-01: an injected topic ID cannot reparent or edit a different material's topic", async () => {
    const target = await seedMaterial(f!.aSpace.id);
    const foreign = await seedTopic(f!.aOther.id);
    await db
      .update(materials)
      .set({ status: "review_topics" })
      .where(eq(materials.id, target.id));
    const response = await saveDraft(
      materialRequest(
        `/api/materials/${target.id}/topic-draft`,
        "PUT",
        f!.a.cookie,
        {
          topics: [
            {
              id: foreign.id,
              name: "Synthetic new local topic",
              description: "A local draft",
            },
          ],
        },
      ),
      materialContext(target.id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.topics[0].id).not.toBe(foreign.id);
    expect(
      (await db.select().from(topics).where(eq(topics.id, foreign.id)))[0],
    ).toEqual(foreign);
    const [link] = await db
      .select()
      .from(materialTopics)
      .where(eq(materialTopics.materialId, target.id));
    expect(link.spaceId).toBe(target.spaceId);
  });

  it("SEC-RAG-01: hard-deleted materials lose chunks; soft-deleted spaces fail the caller's ownership gate", async () => {
    const material = await seedMaterial(f!.aSpace.id);
    await db.insert(chunks).values({
      materialId: material.id,
      spaceId: material.spaceId,
      chunkIndex: 0,
      content: "Synthetic content",
      pageStart: 1,
      pageEnd: 1,
      embedding: vector(1, 0),
      embeddingModel: embeddingModelName(),
    });
    await db.delete(materials).where(eq(materials.id, material.id));
    expect(
      await searchChunks({
        spaceId: material.spaceId,
        materialIds: [material.id],
        queryVector: vector(1, 0),
        limit: 10,
      }),
    ).toEqual([]);
    await db
      .update(studySpaces)
      .set({ deletedAt: new Date() })
      .where(eq(studySpaces.id, f!.aSpace.id));
    // searchChunks documents that its caller must authorise the space first.
    await expect(requireSpace(f!.aSpace.id, f!.a.user)).rejects.toMatchObject({
      code: "SPACE_NOT_FOUND",
      status: 404,
    });
  });
});
