import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { eligibleMistake, openMistake } from "@/server/db/mistake-filter";
import { learningItems, revisionEvents, revisionItems, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { weakTopicIds } from "@/features/progress/server";
import { requireTopic } from "@/features/topics/server";
import {
  MISTAKES_SESSION_SIZE,
  REVISION_API_ERRORS,
  type CheckRequest,
  type CheckResult,
  type MistakeQuestion,
  type MistakesQuery,
  type MistakesResponse,
  type RevisionApiErrorCode,
} from "../revision-schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function revisionError(code: RevisionApiErrorCode): ApiError {
  const { status, message } = REVISION_API_ERRORS[code];
  return new ApiError(code, message, status);
}

/** Open, eligible mistakes in a topic or a Study Space, weak topics first, then oldest first. */
export async function listMistakes(user: SessionUser, query: MistakesQuery): Promise<MistakesResponse> {
  // Ownership first: someone else's topic or space is a 404, never an empty list.
  const scope = query.topicId
    ? eq(revisionItems.topicId, (await requireTopic(query.topicId, user)).id)
    : eq(revisionItems.spaceId, (await requireSpace(query.spaceId!, user)).id);
  const rows = await db
    .select({ id: revisionItems.id, topicId: revisionItems.topicId, topicName: topics.name, prompt: learningItems.prompt, options: learningItems.options })
    .from(revisionItems)
    .innerJoin(learningItems, eq(learningItems.id, revisionItems.itemId))
    .innerJoin(topics, eq(topics.id, revisionItems.topicId))
    .innerJoin(studySpaces, eq(studySpaces.id, revisionItems.spaceId))
    .where(and(openMistake(user.id), scope))
    .orderBy(asc(revisionItems.createdAt), asc(revisionItems.id));
  const weak = await weakTopicIds(user.id, rows.map((r) => r.topicId));
  // The query's oldest-first order is kept within each group (stable sort).
  const items: MistakeQuestion[] = rows
    .sort((a, b) => Number(weak.has(b.topicId)) - Number(weak.has(a.topicId)))
    .slice(0, MISTAKES_SESSION_SIZE)
    .map((r) => ({ id: r.id, topicId: r.topicId, topicName: r.topicName, prompt: r.prompt, options: r.options ?? [] }));
  return { items, total: rows.length };
}

/**
 * Locks the mistake, then looks for the request key (a double click gets the
 * first result), then checks the answer. A correct check clears the mistake;
 * a wrong one leaves it open. Nothing here touches `attempt_items`.
 */
export async function checkMistake(user: SessionUser, revisionItemId: string, input: CheckRequest): Promise<CheckResult> {
  if (!UUID.test(revisionItemId)) throw revisionError("REVISION_ITEM_NOT_FOUND");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ r: revisionItems, li: learningItems })
      .from(revisionItems)
      .innerJoin(learningItems, eq(learningItems.id, revisionItems.itemId))
      .innerJoin(topics, eq(topics.id, revisionItems.topicId))
      .innerJoin(studySpaces, eq(studySpaces.id, revisionItems.spaceId))
      .where(and(eq(revisionItems.id, revisionItemId), eligibleMistake(user.id)))
      .for("update", { of: revisionItems });
    if (!row) throw revisionError("REVISION_ITEM_NOT_FOUND");
    const result = (outcome: CheckResult["outcome"], cleared: boolean): CheckResult => ({
      outcome,
      correctIndex: row.li.correctIndex!,
      explanation: row.li.explanation,
      cleared,
    });

    const [previous] = await tx
      .select()
      .from(revisionEvents)
      .where(and(eq(revisionEvents.revisionItemId, row.r.id), eq(revisionEvents.requestKey, input.requestKey)));
    if (previous) return result(previous.outcome === "correct" ? "correct" : "incorrect", previous.outcome === "correct" || row.r.clearedAt !== null);

    const correct = input.selectedIndex === row.li.correctIndex;
    // A correct check clears an open mistake; a check on an already-cleared one is recorded but never reopens it.
    await tx
      .update(revisionItems)
      .set({ lastReviewedAt: new Date(), ...(correct && !row.r.clearedAt ? { clearedAt: sql`now()` } : {}) })
      .where(eq(revisionItems.id, row.r.id));
    await tx.insert(revisionEvents).values({
      revisionItemId: row.r.id,
      outcome: correct ? "correct" : "incorrect",
      requestKey: input.requestKey,
      selectedIndex: input.selectedIndex,
    });
    return result(correct ? "correct" : "incorrect", correct || row.r.clearedAt !== null);
  });
}
