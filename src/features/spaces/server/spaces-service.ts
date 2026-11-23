import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { materials, studySpaces } from "@/server/db/schema";
import { isValidSpaceId } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { getUnfinishedQuizzes, type UnfinishedQuiz } from "@/features/plan/server";
import { getAllProgress, type SpaceProgress } from "@/features/progress/server";
import type { SpaceResponse, SpaceSummary } from "../spaces-schemas";

const SPACE_COLUMNS = {
  id: studySpaces.id,
  name: studySpaces.name,
  createdAt: studySpaces.createdAt,
  updatedAt: studySpaces.updatedAt,
};

type SpaceRow = { id: string; name: string; createdAt: Date; updatedAt: Date };

function toSpaceResponse(space: SpaceRow): SpaceResponse {
  return {
    id: space.id,
    name: space.name,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };
}

/** Newest first (T-05 plan, issue #14, Approach step 4). Owner always comes from the session. */
export async function listSpaces(user: SessionUser): Promise<SpaceResponse[]> {
  const rows = await db
    .select(SPACE_COLUMNS)
    .from(studySpaces)
    .where(and(eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .orderBy(desc(studySpaces.createdAt));
  return rows.map(toSpaceResponse);
}

/**
 * One card's worth of counts per space, newest space first (Dashboard and
 * Study Spaces). Read-only and owner-scoped: the spaces come from the
 * session's own list, the material counts from one grouped query (not one
 * per space), and the weak and confirmed topic counts from the same
 * progress service Analytics uses. Callers that already loaded progress or
 * unfinished quizzes (the Dashboard) can pass them in to skip the repeat reads.
 */
export async function listSpaceSummaries(
  user: SessionUser,
  loaded: { progress?: SpaceProgress[]; unfinished?: UnfinishedQuiz[] } = {},
): Promise<SpaceSummary[]> {
  const spaces = await listSpaces(user);
  if (spaces.length === 0) return [];

  const [progress, unfinished, materialRows] = await Promise.all([
    loaded.progress ?? getAllProgress(user),
    loaded.unfinished ?? getUnfinishedQuizzes(user),
    db
      .select({
        spaceId: materials.spaceId,
        total: sql<number>`count(*)::int`,
        topicsReady: sql<number>`(count(*) filter (where ${materials.status} = 'review_topics'))::int`,
      })
      .from(materials)
      .where(inArray(materials.spaceId, spaces.map((space) => space.id)))
      .groupBy(materials.spaceId),
  ]);

  const materialCounts = new Map(materialRows.map((row) => [row.spaceId, row]));
  const progressBySpace = new Map(progress.map((entry) => [entry.spaceId, entry]));

  return spaces.map((space) => {
    const topics = progressBySpace.get(space.id)?.topics ?? [];
    const counts = materialCounts.get(space.id);
    return {
      id: space.id,
      name: space.name,
      materialCount: counts?.total ?? 0,
      confirmedTopicCount: topics.length,
      weakTopicCount: topics.filter((topic) => topic.status === "weak").length,
      topicsReadyCount: counts?.topicsReady ?? 0,
      quizzesInProgress: unfinished.filter((quiz) => quiz.spaceId === space.id).length,
    };
  });
}

export async function createSpace(user: SessionUser, name: string): Promise<SpaceResponse> {
  const [space] = await db
    .insert(studySpaces)
    .values({ ownerId: user.id, name })
    .returning(SPACE_COLUMNS);
  return toSpaceResponse(space);
}

/**
 * A single conditional `UPDATE ... WHERE id AND owner_id AND deleted_at IS
 * NULL` rather than `requireSpace()` followed by a separate write: that
 * would check and act in two queries, leaving a gap. Zero rows returned
 * means "not found, not yours, or already deleted" — all the same 404
 * (PRD plan: "no check-then-write gap").
 */
export async function renameSpace(
  user: SessionUser,
  spaceId: string,
  name: string,
): Promise<SpaceResponse> {
  if (!isValidSpaceId(spaceId)) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }

  const [space] = await db
    .update(studySpaces)
    .set({ name })
    .where(
      and(
        eq(studySpaces.id, spaceId),
        eq(studySpaces.ownerId, user.id),
        isNull(studySpaces.deletedAt),
      ),
    )
    .returning(SPACE_COLUMNS);

  if (!space) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }
  return toSpaceResponse(space);
}

/**
 * Soft delete (Arya, 2026-11-08): sets `deleted_at` rather than removing
 * the row. Same single conditional update as `renameSpace()` — a second
 * `DELETE` on an already-deleted space matches zero rows and gets the
 * identical 404, not a different error.
 */
export async function deleteSpace(user: SessionUser, spaceId: string): Promise<void> {
  if (!isValidSpaceId(spaceId)) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }

  const [space] = await db
    .update(studySpaces)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(studySpaces.id, spaceId),
        eq(studySpaces.ownerId, user.id),
        isNull(studySpaces.deletedAt),
      ),
    )
    .returning({ id: studySpaces.id });

  if (!space) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }
}
