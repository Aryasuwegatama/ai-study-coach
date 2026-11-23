import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { safeTimeZone } from "@/lib/time-zone";
import { db } from "@/server/db/db-client";
import { attemptItems, attempts, jobs, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { publishStep } from "@/server/jobs/jobs-client";
import { closeJob } from "@/server/jobs/job-claims";
import {
  DAILY_GENERATION_LIMIT,
  QUIZ_API_ERRORS,
  SET_FAILURE_REASONS,
  TOO_MANY_TOPICS_DECK_MESSAGE,
  type CardStyle,
  type CreateSetRequest,
  type LatestAttemptSummary,
  type RenameSetRequest,
  type QuizApiErrorCode,
  type SetDetailResponse,
  type SetFailureCode,
  type SetListItemResponse,
  type SetResponse,
} from "../quizzes-schemas";

type SetRow = typeof studySets.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function quizError(code: QuizApiErrorCode, message?: string): ApiError {
  const { status, message: defaultMessage } = QUIZ_API_ERRORS[code];
  return new ApiError(code, message ?? defaultMessage, status);
}

export function toSetResponse(row: SetRow): SetResponse {
  const code = row.errorCode as SetFailureCode | null;
  return {
    id: row.id,
    kind: row.kind as SetResponse["kind"],
    title: row.title,
    cardStyle: row.cardStyle as CardStyle | null,
    status: row.status as SetResponse["status"],
    requestedCount: row.requestedCount,
    generatedCount: row.generatedCount,
    materialIds: row.materialIds,
    topicIds: row.topicIds,
    error: row.status === "failed" ? { code: code ?? "GENERATION_FAILED", message: SET_FAILURE_REASONS[code ?? "GENERATION_FAILED"] } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A set the user owns, in a space that isn't deleted. */
export async function requireSet(setId: string, user: SessionUser): Promise<SetRow> {
  if (!UUID.test(setId)) throw quizError("SET_NOT_FOUND");
  const [row] = await db
    .select({ set: studySets })
    .from(studySets)
    .innerJoin(studySpaces, eq(studySpaces.id, studySets.spaceId))
    .where(and(eq(studySets.id, setId), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .limit(1);
  if (!row) throw quizError("SET_NOT_FOUND");
  return row.set;
}

/** Starts a quiz or a deck of flashcards: the same checks, in the same order, then a `generate_quiz` or `generate_deck` job. */
export async function createSet(user: SessionUser, spaceId: string, input: CreateSetRequest): Promise<SetResponse> {
  const space = await requireSpace(spaceId, user);

  const ready = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.spaceId, space.id), inArray(materials.id, input.materialIds), eq(materials.status, "ready")));
  if (ready.length !== input.materialIds.length) throw quizError("MATERIAL_NOT_READY");

  const linked = await db
    .selectDistinct({ id: topics.id, name: topics.name })
    .from(topics)
    .innerJoin(materialTopics, eq(materialTopics.topicId, topics.id))
    .where(
      and(
        eq(topics.spaceId, space.id),
        eq(topics.status, "confirmed"),
        inArray(topics.id, input.topicIds),
        inArray(materialTopics.materialId, input.materialIds),
      ),
    );
  if (linked.length !== input.topicIds.length) throw quizError("TOPIC_NOT_IN_MATERIALS");
  const isDeck = input.kind === "deck";
  if (input.topicIds.length > input.count) throw quizError("TOO_MANY_TOPICS", isDeck ? TOO_MANY_TOPICS_DECK_MESSAGE : undefined);
  const jobKind = isDeck ? "generate_deck" : "generate_quiz";

  // A quiz takes the student's own name, or "Quiz N" (its topics show as tags, not in the name).
  // A deck keeps its topic-based name until the flashcards screens are redesigned.
  let title: string;
  if (input.kind === "quiz") {
    if (input.title) {
      title = input.title;
    } else {
      const [{ existing }] = await db
        .select({ existing: count() })
        .from(studySets)
        .where(and(eq(studySets.spaceId, space.id), eq(studySets.kind, "quiz")));
      title = `Quiz ${existing + 1}`;
    }
  } else {
    const names = input.topicIds.map((id) => linked.find((t) => t.id === id)!.name);
    title = names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
  }
  const tz = safeTimeZone(user.timeZone);

  const job = await db.transaction(async (tx) => {
    // One student's generations are counted one at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`generate:${user.id}`}))`);
    const [{ today }] = await tx
      .select({ today: count() })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, user.id),
          inArray(jobs.kind, ["generate_quiz", "generate_deck"]),
          gte(jobs.createdAt, sql`date_trunc('day', now() at time zone ${tz}) at time zone ${tz}`),
        ),
      );
    if (today >= DAILY_GENERATION_LIMIT) throw quizError("DAILY_LIMIT_REACHED");

    const [set] = await tx
      .insert(studySets)
      .values({
        spaceId: space.id,
        kind: input.kind,
        title,
        cardStyle: input.kind === "deck" ? input.cardStyle : null,
        materialIds: input.materialIds,
        topicIds: input.topicIds,
        requestedCount: input.count,
      })
      .returning();
    const [row] = await tx
      .insert(jobs)
      .values({
        userId: user.id,
        spaceId: space.id,
        kind: jobKind,
        targetId: set.id,
        step: "retrieve",
        idempotencyKey: `${jobKind}:${set.id}`,
      })
      .returning({ id: jobs.id });
    return { id: row.id, set };
  });

  try {
    await publishStep({ jobId: job.id, step: "retrieve" }, { flow: "generation" });
  } catch {
    await db.transaction(async (tx) => {
      await tx.update(studySets).set({ status: "failed", errorCode: "GENERATION_FAILED" }).where(eq(studySets.id, job.set.id));
      await closeJob(tx, job.id, "failed", "PUBLISH_FAILED");
    });
    return toSetResponse(await requireSet(job.set.id, user));
  }
  return toSetResponse(job.set);
}

/**
 * The Quiz Library's list (T-12b, gap 1): each set with its newest
 * attempt and whether any attempt was ever submitted. Three queries for
 * the whole list, not one per quiz — the attempts and active-item counts
 * are each fetched once, batched over every set id.
 */
export async function listSets(user: SessionUser, spaceId: string, kind: "quiz" | "deck" | null): Promise<SetListItemResponse[]> {
  const space = await requireSpace(spaceId, user);
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.spaceId, space.id), kind ? eq(studySets.kind, kind) : undefined))
    .orderBy(desc(studySets.createdAt));
  if (rows.length === 0) return [];

  const setIds = rows.map((r) => r.id);

  const attemptRows = await db
    .select({ id: attempts.id, setId: attempts.setId, status: attempts.status, score: attempts.score, total: attempts.total })
    .from(attempts)
    .where(and(inArray(attempts.setId, setIds), eq(attempts.studentId, user.id)))
    .orderBy(desc(attempts.startedAt));

  const attemptsBySet = new Map<string, typeof attemptRows>();
  for (const row of attemptRows) {
    const list = attemptsBySet.get(row.setId);
    if (list) list.push(row);
    else attemptsBySet.set(row.setId, [row]);
  }

  const latestInProgressIds = [...attemptsBySet.values()]
    .map((list) => list[0])
    .filter((latest) => latest.status === "in_progress")
    .map((latest) => latest.id);
  const answeredCounts = latestInProgressIds.length
    ? await db
        .select({ attemptId: attemptItems.attemptId, answered: count() })
        .from(attemptItems)
        .where(and(inArray(attemptItems.attemptId, latestInProgressIds), isNotNull(attemptItems.selectedIndex)))
        .groupBy(attemptItems.attemptId)
    : [];
  const answeredByAttemptId = new Map(answeredCounts.map((r) => [r.attemptId, r.answered]));

  const activeCounts = await db
    .select({ setId: learningItems.setId, active: count() })
    .from(learningItems)
    .where(and(inArray(learningItems.setId, setIds), eq(learningItems.status, "active")))
    .groupBy(learningItems.setId);
  const activeBySetId = new Map(activeCounts.map((r) => [r.setId, r.active]));

  // Current topic names for the tags (a rename shows the new name).
  const allTopicIds = [...new Set(rows.flatMap((r) => r.topicIds))];
  const topicRows = allTopicIds.length
    ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, allTopicIds))
    : [];
  const topicNameById = new Map(topicRows.map((t) => [t.id, t.name]));

  return rows.map((row) => {
    const setAttempts = attemptsBySet.get(row.id) ?? [];
    const latest = setAttempts[0];
    const hasResults = setAttempts.some((a) => a.status === "submitted");
    let latestAttempt: LatestAttemptSummary;
    if (!latest) {
      latestAttempt = { status: "none" };
    } else if (latest.status === "in_progress") {
      latestAttempt = {
        status: "in_progress",
        attemptId: latest.id,
        answeredCount: answeredByAttemptId.get(latest.id) ?? 0,
        totalCount: latest.total,
      };
    } else {
      const total = latest.total;
      const score = latest.score ?? 0;
      latestAttempt = { status: "submitted", attemptId: latest.id, score, total, percent: total ? Math.round((score / total) * 100) : 0 };
    }
    const setTopics = row.topicIds.flatMap((id) => {
      const name = topicNameById.get(id);
      return name ? [{ id, name }] : [];
    });
    return { ...toSetResponse(row), latestAttempt, hasResults, activeCount: activeBySetId.get(row.id) ?? 0, topics: setTopics };
  });
}

/** Renames one of the student's own sets. The name is the only thing a student can edit. */
export async function renameSet(user: SessionUser, setId: string, input: RenameSetRequest): Promise<SetResponse> {
  const set = await requireSet(setId, user);
  const [row] = await db.update(studySets).set({ title: input.title }).where(eq(studySets.id, set.id)).returning();
  return toSetResponse(row);
}

export async function getSet(user: SessionUser, setId: string): Promise<SetDetailResponse> {
  const set = await requireSet(setId, user);
  const items =
    set.status === "ready"
      ? await db
          .select()
          .from(learningItems)
          .where(and(eq(learningItems.setId, set.id), eq(learningItems.status, "active")))
          .orderBy(asc(learningItems.position))
      : [];
  return {
    set: toSetResponse(set),
    items: items.map((i) => ({
      id: i.id,
      position: i.position,
      topicId: i.topicId,
      prompt: i.prompt,
      options: i.options ?? [],
      difficulty: i.difficulty as SetDetailResponse["items"][number]["difficulty"],
    })),
  };
}

/**
 * A deck can always be deleted. A quiz with a submitted attempt is the student's record (scores, mastery
 * evidence, revision items), so it can't be deleted (Arya, 2026-11-14,
 * #35). Failed, generating, never-attempted and in-progress-only quizzes
 * can. A still-running job sees the set gone at its next step and stops.
 */
export async function deleteSet(user: SessionUser, setId: string): Promise<void> {
  const set = await requireSet(setId, user);
  if (set.kind === "deck") {
    // Ratings aren't mastery evidence, so a deck can always go; its practice
    // sessions and cards go with it (foreign keys cascade).
    await db.delete(studySets).where(eq(studySets.id, set.id));
    return;
  }
  await db.transaction(async (tx) => {
    // Lock the quiz row first. Creating an attempt has to key-share lock
    // it (the attempt's foreign key), so a first attempt can't be created
    // between this check and the delete: one being created now finishes
    // first and is seen below, and a later one waits, then finds the quiz
    // gone (Codex review on #37).
    const [locked] = await tx.select({ id: studySets.id }).from(studySets).where(eq(studySets.id, set.id)).for("update");
    if (!locked) throw quizError("SET_NOT_FOUND");
    // Then its attempts: a submit in flight finishes first and is seen
    // here, and a submit that arrives after waits, then finds its attempt
    // gone (404). Submit locks its attempt row the same way.
    const rows = await tx
      .select({ status: attempts.status })
      .from(attempts)
      .where(eq(attempts.setId, set.id))
      .for("update");
    if (rows.some((r) => r.status === "submitted")) throw quizError("SET_HAS_RESULTS");
    await tx.delete(studySets).where(eq(studySets.id, set.id));
  });
}
