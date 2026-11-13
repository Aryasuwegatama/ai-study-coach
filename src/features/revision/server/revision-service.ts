import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { localDate } from "@/lib/time-zone";
import { db } from "@/server/db/db-client";
import { learningItems, revisionEvents, revisionItems, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { weakTopicIds } from "@/features/progress/server";
import {
  REVISION_API_ERRORS,
  REVISION_SESSION_SIZE,
  UPCOMING_DAYS,
  nextSchedule,
  type ReviewRequest,
  type ReviewResult,
  type RevisionApiErrorCode,
  type RevisionListItem,
  type RevisionListResponse,
  type RevisionSessionItem,
} from "../revision-schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function revisionError(code: RevisionApiErrorCode): ApiError {
  const { status, message } = REVISION_API_ERRORS[code];
  return new ApiError(code, message, status);
}

/** Still eligible: the student's, in a live space, question active and still sourced. */
const eligible = (studentId: string) =>
  and(
    eq(revisionItems.studentId, studentId),
    eq(studySpaces.ownerId, studentId),
    isNull(studySpaces.deletedAt),
    eq(learningItems.status, "active"),
    sql`exists (select 1 from item_sources s where s.item_id = ${revisionItems.itemId})`,
  );

function dueRows(user: SessionUser, until: ReturnType<typeof localDate>, spaceId?: string) {
  return db
    .select({ r: revisionItems, li: learningItems, topicName: topics.name, spaceName: studySpaces.name })
    .from(revisionItems)
    .innerJoin(learningItems, eq(learningItems.id, revisionItems.itemId))
    .innerJoin(topics, eq(topics.id, revisionItems.topicId))
    .innerJoin(studySpaces, eq(studySpaces.id, revisionItems.spaceId))
    .where(and(eligible(user.id), lte(revisionItems.dueDate, until), spaceId ? eq(revisionItems.spaceId, spaceId) : undefined))
    .orderBy(asc(revisionItems.dueDate), asc(revisionItems.createdAt));
}

async function today(user: SessionUser): Promise<string> {
  const [{ d }] = await db.execute<{ d: string }>(sql`select ${localDate(user.timeZone)}::text as d`).then((r) => r.rows);
  return d;
}

export async function listRevision(user: SessionUser): Promise<RevisionListResponse> {
  const now = await today(user);
  const rows = await dueRows(user, localDate(user.timeZone, UPCOMING_DAYS));
  const weak = await weakTopicIds(user.id, rows.map((r) => r.r.topicId));
  const items: RevisionListItem[] = rows.map(({ r, li, topicName, spaceName }) => ({
    id: r.id,
    itemId: r.itemId,
    spaceId: r.spaceId,
    spaceName,
    topicId: r.topicId,
    topicName,
    prompt: li.prompt,
    dueDate: r.dueDate,
    intervalDays: r.intervalDays,
    weakTopic: weak.has(r.topicId),
  }));
  // Weak topics first within each group; the query's due-date order is kept otherwise (stable sort).
  const group = (keep: (d: string) => boolean) => items.filter((i) => keep(i.dueDate)).sort((a, b) => Number(b.weakTopic) - Number(a.weakTopic));
  return { today: now, overdue: group((d) => d < now), dueToday: group((d) => d === now), upcoming: group((d) => d > now) };
}

export async function startSession(user: SessionUser, spaceId?: string): Promise<RevisionSessionItem[]> {
  if (spaceId) await requireSpace(spaceId, user);
  const rows = await dueRows(user, localDate(user.timeZone), spaceId);
  const weak = await weakTopicIds(user.id, rows.map((r) => r.r.topicId));
  return rows
    .sort((a, b) => Number(weak.has(b.r.topicId)) - Number(weak.has(a.r.topicId)))
    .slice(0, REVISION_SESSION_SIZE)
    .map(({ r, li, topicName }) => ({ id: r.id, kind: "mcq", topicId: r.topicId, topicName, prompt: li.prompt, options: li.options ?? [] }));
}

/** Locks the item, then the request key (a double click gets the first result), then the due check. */
export async function reviewItem(user: SessionUser, revisionItemId: string, input: ReviewRequest): Promise<ReviewResult> {
  if (!UUID.test(revisionItemId)) throw revisionError("REVISION_ITEM_NOT_FOUND");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ r: revisionItems, li: learningItems })
      .from(revisionItems)
      .innerJoin(learningItems, eq(learningItems.id, revisionItems.itemId))
      .innerJoin(studySpaces, eq(studySpaces.id, revisionItems.spaceId))
      .where(and(eq(revisionItems.id, revisionItemId), eligible(user.id)))
      .for("update", { of: revisionItems });
    if (!row) throw revisionError("REVISION_ITEM_NOT_FOUND");
    const result = (outcome: string, intervalDays: number, nextDueDate: string): ReviewResult => ({
      outcome: outcome as ReviewResult["outcome"],
      correctIndex: row.li.correctIndex!,
      explanation: row.li.explanation,
      intervalDays,
      nextDueDate,
    });

    const [previous] = await tx
      .select()
      .from(revisionEvents)
      .where(and(eq(revisionEvents.revisionItemId, row.r.id), eq(revisionEvents.requestKey, input.requestKey)));
    if (previous) return result(previous.outcome, previous.intervalAfter, previous.dueDateAfter);

    const [{ due }] = (await tx.execute<{ due: boolean }>(sql`select ${row.r.dueDate}::date <= ${localDate(user.timeZone)} as due`)).rows;
    if (!due) throw revisionError("REVISION_NOT_DUE");

    const success = input.selectedIndex === row.li.correctIndex;
    const next = nextSchedule(row.r.streak, success);
    const [updated] = await tx
      .update(revisionItems)
      .set({ streak: next.streak, intervalDays: next.intervalDays, dueDate: localDate(user.timeZone, next.intervalDays), lastReviewedAt: new Date() })
      .where(eq(revisionItems.id, row.r.id))
      .returning({ dueDate: revisionItems.dueDate });
    const outcome = success ? "correct" : "incorrect";
    await tx.insert(revisionEvents).values({
      revisionItemId: row.r.id,
      outcome,
      requestKey: input.requestKey,
      selectedIndex: input.selectedIndex,
      intervalBefore: row.r.intervalDays,
      intervalAfter: next.intervalDays,
      dueDateAfter: updated.dueDate,
    });
    return result(outcome, next.intervalDays, updated.dueDate);
  });
}
