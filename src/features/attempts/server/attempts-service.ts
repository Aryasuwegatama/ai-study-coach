import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { localDate } from "@/lib/time-zone";
import { db } from "@/server/db/db-client";
import {
  attemptItems,
  attempts,
  chunks,
  itemSources,
  learningItems,
  materials,
  revisionItems,
  studySpaces,
  topics,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import { requireSet } from "@/features/quizzes/server";
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

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

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
  if (!items.length) throw attemptError("SET_NOT_READY");

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
  if (attempt.status !== "in_progress") throw attemptError("ATTEMPT_SUBMITTED");
  // One UPDATE, gated on the attempt still being in progress, so a late autosave can't touch a scored attempt.
  const updated = await db
    .update(attemptItems)
    .set({
      selectedIndex: input.selectedIndex === null ? null : sql`${attemptItems.optionOrder}[${input.selectedIndex + 1}::int]`,
      answeredAt: input.selectedIndex === null ? null : new Date(),
    })
    .where(
      and(
        eq(attemptItems.attemptId, attempt.id),
        eq(attemptItems.itemId, input.itemId),
        sql`exists (select 1 from ${attempts} where ${attempts.id} = ${attempt.id} and ${attempts.status} = 'in_progress')`,
      ),
    )
    .returning({ itemId: attemptItems.itemId });
  if (!updated.length) {
    const fresh = await requireAttempt(attemptId, user);
    throw attemptError(fresh.status === "in_progress" ? "ITEM_NOT_IN_ATTEMPT" : "ATTEMPT_SUBMITTED");
  }
  return toAttemptResponse(attempt);
}

/** Scores on the server in one transaction. A second submit returns the stored result. */
export async function submitAttempt(user: SessionUser, attemptId: string): Promise<AttemptResponse> {
  const owned = await requireAttempt(attemptId, user);
  const attempt = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(attempts).where(eq(attempts.id, owned.id)).for("update");
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

    // Wrong answers enter revision, due the next local day; one per student per question.
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
        .values(
          toReview.map((r) => ({
            studentId: user.id,
            spaceId: locked.spaceId,
            itemId: r.item.itemId,
            topicId: r.topicId,
            dueDate: localDate(user.timeZone, 1),
          })),
        )
        .onConflictDoNothing({ target: [revisionItems.studentId, revisionItems.itemId] });
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

  const questions: AttemptQuestion[] = rows.map(({ item, li }) => ({
    itemId: item.itemId,
    position: item.position,
    topicId: li.topicId,
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

  const topicScores = new Map<string, AttemptResult["topics"][number]>();
  const results = rows.map(({ item, li, topicName }, i) => {
    const isCorrect = item.isCorrect === true;
    const t = topicScores.get(li.topicId) ?? { topicId: li.topicId, topicName, correct: 0, total: 0 };
    t.total++;
    if (isCorrect) t.correct++;
    topicScores.set(li.topicId, t);
    return {
      ...questions[i],
      topicName,
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
