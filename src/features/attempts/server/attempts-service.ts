import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import {
  attemptItems,
  attempts,
  chunks,
  contentReports,
  itemSources,
  learningItems,
  materials,
  revisionItems,
  studySpaces,
  topics,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import { quizError, requireSet } from "@/features/quizzes/server";
import {
  ATTEMPT_API_ERRORS,
  type AttemptApiErrorCode,
  type AttemptQuestion,
  type AttemptResponse,
  type AttemptResult,
  type SaveAnswerRequest,
} from "../attempts-schemas";

type AttemptRow = typeof attempts.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function attemptError(code: AttemptApiErrorCode): ApiError {
  const { status, message } = ATTEMPT_API_ERRORS[code];
  return new ApiError(code, message, status);
}

function hasPgCode(error: unknown, code: string): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === code || e?.cause?.code === code;
}
const isUniqueViolation = (error: unknown) => hasPgCode(error, "23505");
const isForeignKeyViolation = (error: unknown) => hasPgCode(error, "23503");

function shuffle<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The student's own attempt, in a space that isn't deleted. */
export async function requireAttempt(attemptId: string, user: SessionUser): Promise<AttemptRow> {
  if (!UUID.test(attemptId)) throw attemptError("ATTEMPT_NOT_FOUND");
  const [row] = await db
    .select({ attempt: attempts })
    .from(attempts)
    .innerJoin(studySpaces, eq(studySpaces.id, attempts.spaceId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, user.id), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .limit(1);
  if (!row) throw attemptError("ATTEMPT_NOT_FOUND");
  return row.attempt;
}

/** Starts a new attempt, or returns the in-progress one (`created: false`). */
export async function startAttempt(user: SessionUser, setId: string): Promise<{ attempt: AttemptResponse; created: boolean }> {
  const set = await requireSet(setId, user);
  if (set.status !== "ready" || set.kind !== "quiz") throw attemptError("SET_NOT_READY");

  const inProgress = async () =>
    (
      await db
        .select()
        .from(attempts)
        .where(and(eq(attempts.setId, set.id), eq(attempts.studentId, user.id), eq(attempts.status, "in_progress")))
    )[0];
  const existing = await inProgress();
  if (existing) return { attempt: await toAttemptResponse(existing), created: false };

  const items = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .where(and(eq(learningItems.setId, set.id), eq(learningItems.status, "active")));
  // A `ready` quiz always published at least `MIN_PUBLISHED_QUESTIONS`, so
  // none left active here means every one was removed by a report, not
  // that the quiz itself isn't ready yet (T-12b).
  if (!items.length) throw attemptError("SET_NO_ACTIVE_QUESTIONS");

  try {
    const attempt = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attempts)
        .values({ spaceId: set.spaceId, setId: set.id, studentId: user.id, total: items.length })
        .returning();
      await tx.insert(attemptItems).values(
        shuffle(items).map((item, position) => ({
          attemptId: row.id,
          spaceId: set.spaceId,
          setId: set.id,
          itemId: item.id,
          position,
          optionOrder: shuffle([0, 1, 2, 3]),
        })),
      );
      return row;
    });
    return { attempt: await toAttemptResponse(attempt), created: true };
  } catch (error) {
    // The quiz was deleted while this start waited behind the delete's lock.
    if (isForeignKeyViolation(error)) throw quizError("SET_NOT_FOUND");
    // Two tabs pressed Start at once: the other one won, resume it.
    const winner = isUniqueViolation(error) ? await inProgress() : undefined;
    if (!winner) throw error;
    return { attempt: await toAttemptResponse(winner), created: false };
  }
}

export async function getAttempt(user: SessionUser, attemptId: string): Promise<AttemptResponse> {
  return toAttemptResponse(await requireAttempt(attemptId, user));
}

export async function saveAnswer(user: SessionUser, attemptId: string, input: SaveAnswerRequest): Promise<AttemptResponse> {
  const attempt = await requireAttempt(attemptId, user);
  await db.transaction(async (tx) => {
    // Lock the attempt first, so an autosave queues behind an in-flight submit and can't change a scored answer.
    const [locked] = await tx.select({ status: attempts.status }).from(attempts).where(eq(attempts.id, attempt.id)).for("update");
    // Gone: its quiz was deleted while this request waited (#35).
    if (!locked) throw attemptError("ATTEMPT_NOT_FOUND");
    if (locked.status !== "in_progress") throw attemptError("ATTEMPT_SUBMITTED");
    const updated = await tx
      .update(attemptItems)
      .set({
        selectedIndex: input.selectedIndex === null ? null : sql`${attemptItems.optionOrder}[${input.selectedIndex + 1}::int]`,
        answeredAt: input.selectedIndex === null ? null : new Date(),
      })
      .where(and(eq(attemptItems.attemptId, attempt.id), eq(attemptItems.itemId, input.itemId)))
      .returning({ itemId: attemptItems.itemId });
    if (!updated.length) throw attemptError("ITEM_NOT_IN_ATTEMPT");
  });
  return toAttemptResponse(attempt);
}

/** Scores on the server in one transaction. A second submit returns the stored result. */
export async function submitAttempt(user: SessionUser, attemptId: string): Promise<AttemptResponse> {
  const owned = await requireAttempt(attemptId, user);
  const attempt = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(attempts).where(eq(attempts.id, owned.id)).for("update");
    // Gone: its quiz was deleted while this request waited (#35).
    if (!locked) throw attemptError("ATTEMPT_NOT_FOUND");
    if (locked.status === "submitted") return locked;

    const rows = await tx
      .select({ item: attemptItems, correctIndex: learningItems.correctIndex, topicId: learningItems.topicId, itemStatus: learningItems.status })
      .from(attemptItems)
      .innerJoin(learningItems, eq(learningItems.id, attemptItems.itemId))
      .where(eq(attemptItems.attemptId, locked.id));
    let score = 0;
    for (const r of rows) {
      const isCorrect = r.item.selectedIndex !== null && r.item.selectedIndex === r.correctIndex;
      if (isCorrect) score++;
      await tx
        .update(attemptItems)
        .set({ isCorrect })
        .where(and(eq(attemptItems.attemptId, locked.id), eq(attemptItems.itemId, r.item.itemId)));
    }

    // Mistakes (T-15): a wrong answer opens one, or reopens a cleared one; one row per student per
    // question. A correct answer clears an open one (the latest answer is right).
    const wrong = rows.filter((r) => r.item.selectedIndex !== null && r.item.selectedIndex !== r.correctIndex && r.itemStatus === "active");
    const sourced = wrong.length
      ? new Set(
          (
            await tx
              .selectDistinct({ itemId: itemSources.itemId })
              .from(itemSources)
              .where(inArray(itemSources.itemId, wrong.map((r) => r.item.itemId)))
          ).map((s) => s.itemId),
        )
      : new Set<string>();
    const toReview = wrong.filter((r) => sourced.has(r.item.itemId));
    if (toReview.length) {
      await tx
        .insert(revisionItems)
        .values(toReview.map((r) => ({ studentId: user.id, spaceId: locked.spaceId, itemId: r.item.itemId, topicId: r.topicId })))
        .onConflictDoUpdate({ target: [revisionItems.studentId, revisionItems.itemId], set: { clearedAt: null } });
    }
    const right = rows.filter((r) => r.item.selectedIndex !== null && r.item.selectedIndex === r.correctIndex);
    if (right.length) {
      await tx
        .update(revisionItems)
        .set({ clearedAt: sql`now()` })
        .where(and(eq(revisionItems.studentId, user.id), inArray(revisionItems.itemId, right.map((r) => r.item.itemId)), isNull(revisionItems.clearedAt)));
    }

    const [done] = await tx
      .update(attempts)
      .set({ status: "submitted", score, total: rows.length, submittedAt: new Date() })
      .where(eq(attempts.id, locked.id))
      .returning();
    return done;
  });
  return toAttemptResponse(attempt);
}

async function toAttemptResponse(attempt: AttemptRow): Promise<AttemptResponse> {
  const rows = await db
    .select({ item: attemptItems, li: learningItems, topicName: topics.name })
    .from(attemptItems)
    .innerJoin(learningItems, eq(learningItems.id, attemptItems.itemId))
    .innerJoin(topics, eq(topics.id, learningItems.topicId))
    .where(eq(attemptItems.attemptId, attempt.id))
    .orderBy(asc(attemptItems.position));

  const questions: AttemptQuestion[] = rows.map(({ item, li, topicName }) => ({
    itemId: item.itemId,
    position: item.position,
    topicId: li.topicId,
    topicName,
    prompt: li.prompt,
    options: item.optionOrder.map((o) => (li.options ?? [])[o]),
    selectedIndex: item.selectedIndex === null ? null : item.optionOrder.indexOf(item.selectedIndex),
  }));
  const base = {
    id: attempt.id,
    setId: attempt.setId,
    status: attempt.status as AttemptResponse["status"],
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  };
  if (attempt.status !== "submitted") return { ...base, questions, result: null };

  const sourceRows = rows.length
    ? await db
        .select({ itemId: itemSources.itemId, chunk: chunks, materialName: materials.originalName })
        .from(itemSources)
        .innerJoin(chunks, eq(chunks.id, itemSources.chunkId))
        .innerJoin(materials, eq(materials.id, chunks.materialId))
        .where(inArray(itemSources.itemId, rows.map((r) => r.item.itemId)))
    : [];

  const reportRows = rows.length
    ? await db
        .select({ itemId: contentReports.itemId, reason: contentReports.reason, removedFromPractice: contentReports.removedFromPractice })
        .from(contentReports)
        .where(and(eq(contentReports.reporterId, attempt.studentId), inArray(contentReports.itemId, rows.map((r) => r.item.itemId))))
    : [];
  const reportByItemId = new Map(reportRows.map((r) => [r.itemId, { reason: r.reason, removedFromPractice: r.removedFromPractice }]));

  const topicScores = new Map<string, AttemptResult["topics"][number]>();
  const results = rows.map(({ item, li, topicName }, i) => {
    const isCorrect = item.isCorrect === true;
    const t = topicScores.get(li.topicId) ?? { topicId: li.topicId, topicName, correct: 0, total: 0 };
    t.total++;
    if (isCorrect) t.correct++;
    topicScores.set(li.topicId, t);
    return {
      ...questions[i],
      correctIndex: item.optionOrder.indexOf(li.correctIndex!),
      isCorrect,
      explanation: li.explanation,
      sources: sourceRows
        .filter((s) => s.itemId === item.itemId)
        .map((s) => ({
          chunkId: s.chunk.id,
          materialName: s.materialName,
          pages: s.chunk.pageStart === s.chunk.pageEnd ? `${s.chunk.pageStart}` : `${s.chunk.pageStart}-${s.chunk.pageEnd}`,
          excerpt: s.chunk.content.slice(0, 600),
        })),
      aiGenerated: true as const,
      report: reportByItemId.get(item.itemId) ?? null,
    };
  });
  const score = attempt.score ?? 0;
  return {
    ...base,
    questions: null,
    result: {
      score,
      total: attempt.total,
      percent: attempt.total ? Math.round((score / attempt.total) * 100) : 0,
      topics: [...topicScores.values()],
      questions: results,
    },
  };
}
