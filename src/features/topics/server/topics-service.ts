import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { materials, materialTopics, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { normalizeTopicName } from "@/server/ai/prompts/topics";
import { materialError, requireMaterial, toMaterialResponse } from "@/features/materials/server";
import type { MaterialResponse } from "@/features/materials/server";
import {
  TOPIC_API_ERRORS,
  type DraftTopicResponse,
  type SaveTopicDraftRequest,
  type TopicApiErrorCode,
  type TopicDraftResponse,
  type TopicResponse,
} from "../topics-schemas";

type TopicRow = typeof topics.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function topicError(code: TopicApiErrorCode): ApiError {
  const { status, message } = TOPIC_API_ERRORS[code];
  return new ApiError(code, message, status);
}

export function toTopicResponse(row: TopicRow): TopicResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as TopicResponse["status"],
    origin: row.origin as TopicResponse["origin"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Serialises topic writes in one space, so name checks and confirms can't race. */
async function lockSpace(tx: Tx, spaceId: string) {
  await tx.select({ id: studySpaces.id }).from(studySpaces).where(eq(studySpaces.id, spaceId)).for("update");
}

/** A confirmed or archived topic the user owns, in a space that isn't deleted. Drafts are reached through their material. */
export async function requireTopic(topicId: string, user: SessionUser): Promise<TopicRow> {
  if (!UUID.test(topicId)) throw topicError("TOPIC_NOT_FOUND");
  const [row] = await db
    .select({ topic: topics })
    .from(topics)
    .innerJoin(studySpaces, eq(studySpaces.id, topics.spaceId))
    .where(
      and(
        eq(topics.id, topicId),
        ne(topics.status, "draft"),
        eq(studySpaces.ownerId, user.id),
        isNull(studySpaces.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw topicError("TOPIC_NOT_FOUND");
  return row.topic;
}

export async function listTopics(user: SessionUser, spaceId: string, includeArchived: boolean): Promise<TopicResponse[]> {
  const space = await requireSpace(spaceId, user);
  const rows = await db
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.spaceId, space.id),
        includeArchived ? inArray(topics.status, ["confirmed", "archived"]) : eq(topics.status, "confirmed"),
      ),
    )
    .orderBy(asc(sql`lower(${topics.name})`));
  return rows.map(toTopicResponse);
}

async function confirmedWithName(tx: Tx, spaceId: string, name: string, exceptId?: string) {
  const [row] = await tx
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.spaceId, spaceId),
        eq(topics.status, "confirmed"),
        eq(topics.normalizedName, normalizeTopicName(name)),
        exceptId ? ne(topics.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return row;
}

export async function createTopic(
  user: SessionUser,
  spaceId: string,
  input: { name: string; description: string },
): Promise<TopicResponse> {
  const space = await requireSpace(spaceId, user);
  return db.transaction(async (tx) => {
    await lockSpace(tx, space.id);
    if (await confirmedWithName(tx, space.id, input.name)) throw topicError("TOPIC_EXISTS");
    const [row] = await tx
      .insert(topics)
      .values({
        spaceId: space.id,
        name: input.name,
        normalizedName: normalizeTopicName(input.name),
        description: input.description,
        status: "confirmed",
        origin: "manual",
      })
      .returning();
    return toTopicResponse(row);
  });
}

export async function updateTopic(
  user: SessionUser,
  topicId: string,
  input: { name?: string; status?: "archived" | "confirmed" },
): Promise<TopicResponse> {
  const topic = await requireTopic(topicId, user);
  try {
    return await db.transaction(async (tx) => {
      await lockSpace(tx, topic.spaceId);
      const name = input.name ?? topic.name;
      const status = input.status ?? topic.status;
      if (status === "confirmed" && (await confirmedWithName(tx, topic.spaceId, name, topic.id))) {
        throw topicError("TOPIC_EXISTS");
      }
      const [row] = await tx
        .update(topics)
        .set({ name, normalizedName: normalizeTopicName(name), status })
        .where(eq(topics.id, topic.id))
        .returning();
      return toTopicResponse(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw topicError("TOPIC_EXISTS");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

async function reviewableMaterial(user: SessionUser, materialId: string) {
  const material = await requireMaterial(materialId, user);
  if (material.status !== "review_topics") throw materialError("INVALID_MATERIAL_STATE");
  return material;
}

async function draftRows(tx: Tx | typeof db, materialId: string) {
  return tx
    .select({ topic: topics, pages: materialTopics.pages })
    .from(materialTopics)
    .innerJoin(topics, eq(topics.id, materialTopics.topicId))
    .where(and(eq(materialTopics.materialId, materialId), eq(topics.status, "draft")))
    .orderBy(asc(topics.createdAt), asc(topics.id));
}

async function toDraftResponse(tx: Tx | typeof db, materialId: string, spaceId: string): Promise<TopicDraftResponse> {
  const rows = await draftRows(tx, materialId);
  const confirmed = await tx
    .select({ id: topics.id, normalizedName: topics.normalizedName })
    .from(topics)
    .where(and(eq(topics.spaceId, spaceId), eq(topics.status, "confirmed")));
  const byName = new Map(confirmed.map((t) => [t.normalizedName, t.id]));
  const draft: DraftTopicResponse[] = rows.map(({ topic, pages }) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    origin: topic.origin as DraftTopicResponse["origin"],
    pages,
    existingTopicId: byName.get(topic.normalizedName) ?? null,
  }));
  return { materialId, topics: draft };
}

export async function getTopicDraft(user: SessionUser, materialId: string): Promise<TopicDraftResponse> {
  const material = await reviewableMaterial(user, materialId);
  return toDraftResponse(db, material.id, material.spaceId);
}

export async function saveTopicDraft(
  user: SessionUser,
  materialId: string,
  input: SaveTopicDraftRequest,
): Promise<TopicDraftResponse> {
  const material = await reviewableMaterial(user, materialId);
  return db.transaction(async (tx) => {
    await lockSpace(tx, material.spaceId);
    const existing = new Map((await draftRows(tx, material.id)).map((r) => [r.topic.id, r]));
    const kept = new Set<string>();
    for (const item of input.topics) {
      const values = { name: item.name, normalizedName: normalizeTopicName(item.name), description: item.description };
      const current = item.id ? existing.get(item.id) : undefined;
      if (current && !kept.has(current.topic.id)) {
        kept.add(current.topic.id);
        await tx.update(topics).set(values).where(eq(topics.id, current.topic.id));
      } else {
        const [row] = await tx
          .insert(topics)
          .values({ ...values, spaceId: material.spaceId, status: "draft", origin: "manual" })
          .returning({ id: topics.id });
        kept.add(row.id);
        await tx.insert(materialTopics).values({ spaceId: material.spaceId, materialId: material.id, topicId: row.id });
      }
    }
    const removed = [...existing.keys()].filter((id) => !kept.has(id));
    if (removed.length) await tx.delete(topics).where(inArray(topics.id, removed));
    return toDraftResponse(tx, material.id, material.spaceId);
  });
}

export async function confirmTopicDraft(
  user: SessionUser,
  materialId: string,
): Promise<{ material: MaterialResponse; topics: TopicResponse[] }> {
  const material = await reviewableMaterial(user, materialId);
  return db.transaction(async (tx) => {
    await lockSpace(tx, material.spaceId);
    const [locked] = await tx.select().from(materials).where(eq(materials.id, material.id)).for("update");
    if (locked?.status !== "review_topics") throw materialError("INVALID_MATERIAL_STATE");

    const draft = await draftRows(tx, material.id);
    if (draft.length === 0) throw topicError("TOPIC_DRAFT_EMPTY");

    const confirmedIds: string[] = [];
    for (const { topic, pages } of draft) {
      const match = await confirmedWithName(tx, material.spaceId, topic.name);
      if (match) {
        // Link to the existing topic instead of creating a duplicate (PRD Section 2).
        await tx
          .insert(materialTopics)
          .values({ spaceId: material.spaceId, materialId: material.id, topicId: match.id, pages })
          .onConflictDoUpdate({
            target: [materialTopics.materialId, materialTopics.topicId],
            set: { pages: sql`(select array(select distinct unnest(${materialTopics.pages} || excluded.pages) order by 1))` },
          });
        await tx.delete(topics).where(eq(topics.id, topic.id));
        confirmedIds.push(match.id);
      } else {
        await tx.update(topics).set({ status: "confirmed" }).where(eq(topics.id, topic.id));
        confirmedIds.push(topic.id);
      }
    }

    const [ready] = await tx
      .update(materials)
      .set({ status: "ready", stage: null, progressDone: null, progressTotal: null })
      .where(eq(materials.id, material.id))
      .returning();
    const rows = await tx.select().from(topics).where(inArray(topics.id, [...new Set(confirmedIds)]));
    return { material: toMaterialResponse(ready), topics: rows.map(toTopicResponse) };
  });
}
