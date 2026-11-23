import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { planItems, studySpaces } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { requireMaterial } from "@/features/materials/server";
import { quizError, requireSet } from "@/features/quizzes/server";
import { requireTopic } from "@/features/topics/server";
import {
  MAX_OPEN_PLAN_ITEMS,
  PLAN_API_ERRORS,
  type CreatePlanItemRequest,
  type PlanApiErrorCode,
  type PlanItemResponse,
  type PlanKind,
  type PlanStage,
  type UpdatePlanItemRequest,
} from "../plan-schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function planError(code: PlanApiErrorCode): ApiError {
  const { status, message } = PLAN_API_ERRORS[code];
  return new ApiError(code, message, status);
}

type Ids = { spaceId: string | null; topicId: string | null; setId: string | null; materialId: string | null };

/**
 * The link for an item, built here from `kind` and the ids (never stored, so a
 * request can't plant one). A missing target id means the target was deleted:
 * the item keeps its title and loses its link.
 */
export function planItemHref(kind: PlanKind, ids: Ids): string | null {
  switch (kind) {
    case "practise_topic":
      return ids.topicId && ids.spaceId ? `/spaces/${ids.spaceId}/quizzes/new?topic=${ids.topicId}` : null;
    case "review_mistakes":
      return ids.topicId ? `/plan/review?topicId=${ids.topicId}` : null;
    case "resume_quiz":
      return ids.setId && ids.spaceId ? `/spaces/${ids.spaceId}/quizzes/${ids.setId}` : null;
    case "practise_deck":
      return ids.setId && ids.spaceId ? `/spaces/${ids.spaceId}/flashcards/${ids.setId}` : null;
    case "review_topics":
      return ids.materialId && ids.spaceId ? `/spaces/${ids.spaceId}/materials/${ids.materialId}/topics` : null;
    default:
      return null;
  }
}

type PlanRow = { item: typeof planItems.$inferSelect; spaceName: string | null };

function toResponse({ item, spaceName }: PlanRow): PlanItemResponse {
  const kind = item.kind as PlanKind;
  return {
    id: item.id,
    kind,
    title: item.title,
    spaceId: item.spaceId,
    spaceName,
    topicId: item.topicId,
    setId: item.setId,
    materialId: item.materialId,
    href: planItemHref(kind, item),
    plannedOn: item.plannedOn,
    startedAt: item.startedAt?.toISOString() ?? null,
    doneAt: item.doneAt?.toISOString() ?? null,
    stage: item.doneAt ? "done" : item.startedAt ? "doing" : "todo",
    createdAt: item.createdAt.toISOString(),
  };
}

/** Items in a deleted (soft-deleted) Study Space are never returned. */
const visibleTo = (studentId: string) =>
  and(eq(planItems.studentId, studentId), or(isNull(planItems.spaceId), isNull(studySpaces.deletedAt)));

const selectItems = () =>
  db.select({ item: planItems, spaceName: studySpaces.name }).from(planItems).leftJoin(studySpaces, eq(studySpaces.id, planItems.spaceId));

/** The student's own item, in a space that isn't deleted. */
async function requirePlanItem(itemId: string, user: SessionUser): Promise<PlanRow> {
  if (!UUID.test(itemId)) throw planError("PLAN_ITEM_NOT_FOUND");
  const [row] = await selectItems()
    .where(and(eq(planItems.id, itemId), visibleTo(user.id)))
    .limit(1);
  if (!row) throw planError("PLAN_ITEM_NOT_FOUND");
  return row;
}

/** Open items by planned day (no day last), then oldest first; then done items, newest done first. */
export async function listPlanItems(user: SessionUser): Promise<PlanItemResponse[]> {
  const rows = await selectItems().where(visibleTo(user.id));
  const open = rows
    .filter((r) => r.item.doneAt === null)
    .sort(
      (a, b) =>
        // `YYYY-MM-DD` strings sort as dates; no day sorts after every day.
        (a.item.plannedOn ?? "9999-99-99").localeCompare(b.item.plannedOn ?? "9999-99-99") ||
        a.item.createdAt.getTime() - b.item.createdAt.getTime(),
    );
  const done = rows.filter((r) => r.item.doneAt !== null).sort((a, b) => b.item.doneAt!.getTime() - a.item.doneAt!.getTime());
  return [...open, ...done].map(toResponse);
}

/** The target must be the student's, and its Study Space is derived from it, never taken from the request. */
async function resolveTarget(user: SessionUser, input: CreatePlanItemRequest): Promise<Ids> {
  const none: Ids = { spaceId: null, topicId: null, setId: null, materialId: null };
  switch (input.kind) {
    case "own":
      return input.spaceId ? { ...none, spaceId: (await requireSpace(input.spaceId, user)).id } : none;
    case "practise_topic":
    case "review_mistakes": {
      const topic = await requireTopic(input.topicId!, user);
      return { ...none, spaceId: topic.spaceId, topicId: topic.id };
    }
    case "resume_quiz": {
      const set = await requireSet(input.setId!, user);
      if (set.kind !== "quiz") throw quizError("SET_NOT_FOUND");
      return { ...none, spaceId: set.spaceId, setId: set.id };
    }
    case "practise_deck": {
      const set = await requireSet(input.setId!, user);
      if (set.kind !== "deck") throw quizError("SET_NOT_FOUND");
      return { ...none, spaceId: set.spaceId, setId: set.id };
    }
    case "review_topics": {
      const material = await requireMaterial(input.materialId!, user);
      return { ...none, spaceId: material.spaceId, materialId: material.id };
    }
  }
}

export async function createPlanItem(user: SessionUser, input: CreatePlanItemRequest): Promise<PlanItemResponse> {
  const ids = await resolveTarget(user, input);
  const id = await db.transaction(async (tx) => {
    // One student's creates queue behind each other, so two at once can't both slip past the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`plan_items:${user.id}`}))`);
    const [{ open }] = await tx
      .select({ open: count() })
      .from(planItems)
      .where(and(eq(planItems.studentId, user.id), isNull(planItems.doneAt)));
    if (open >= MAX_OPEN_PLAN_ITEMS) throw planError("PLAN_ITEM_LIMIT");
    const [row] = await tx
      .insert(planItems)
      .values({ studentId: user.id, kind: input.kind, title: input.title, plannedOn: input.plannedOn ?? null, ...ids })
      .returning({ id: planItems.id });
    return row.id;
  });
  return toResponse(await requirePlanItem(id, user));
}

/**
 * The stamps for a board move. Moving to the column a card is already in keeps
 * its stamps, so a repeated request changes nothing.
 */
function stageStamps(stage: PlanStage, item: typeof planItems.$inferSelect): { startedAt: Date | null; doneAt: Date | null } {
  switch (stage) {
    case "todo":
      return { startedAt: null, doneAt: null };
    case "doing":
      return { startedAt: item.startedAt ?? new Date(), doneAt: null };
    case "done":
      return { startedAt: item.startedAt, doneAt: item.doneAt ?? new Date() };
  }
}

export async function updatePlanItem(user: SessionUser, itemId: string, input: UpdatePlanItemRequest): Promise<PlanItemResponse> {
  const current = await requirePlanItem(itemId, user);
  const stamps = input.stage ? stageStamps(input.stage, current.item) : null;
  await db
    .update(planItems)
    .set({
      title: input.title,
      plannedOn: input.plannedOn,
      startedAt: stamps ? stamps.startedAt : undefined,
      // Marking done stamps the time; Undo clears it. Leaving `done` and `stage` out leaves it alone.
      doneAt: stamps ? stamps.doneAt : input.done === undefined ? undefined : input.done ? (current.item.doneAt ?? new Date()) : null,
    })
    .where(and(eq(planItems.id, current.item.id), eq(planItems.studentId, user.id)));
  return toResponse(await requirePlanItem(current.item.id, user));
}

export async function deletePlanItem(user: SessionUser, itemId: string): Promise<void> {
  const current = await requirePlanItem(itemId, user);
  await db.delete(planItems).where(and(eq(planItems.id, current.item.id), eq(planItems.studentId, user.id)));
}
