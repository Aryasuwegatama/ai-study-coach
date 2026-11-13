import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { safeTimeZone } from "@/lib/time-zone";
import { db } from "@/server/db/db-client";
import { jobs, learningItems, materials, materialTopics, studySets, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { publishStep } from "@/server/jobs/jobs-client";
import { closeJob } from "@/server/jobs/job-claims";
import {
  DAILY_GENERATION_LIMIT,
  QUIZ_API_ERRORS,
  SET_FAILURE_REASONS,
  type CreateQuizRequest,
  type QuizApiErrorCode,
  type SetDetailResponse,
  type SetFailureCode,
  type SetResponse,
} from "../quizzes-schemas";

type SetRow = typeof studySets.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function quizError(code: QuizApiErrorCode): ApiError {
  const { status, message } = QUIZ_API_ERRORS[code];
  return new ApiError(code, message, status);
}

export function toSetResponse(row: SetRow): SetResponse {
  const code = row.errorCode as SetFailureCode | null;
  return {
    id: row.id,
    kind: row.kind as SetResponse["kind"],
    title: row.title,
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

export async function createQuiz(user: SessionUser, spaceId: string, input: CreateQuizRequest): Promise<SetResponse> {
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
  if (input.topicIds.length > input.count) throw quizError("TOO_MANY_TOPICS");

  const names = input.topicIds.map((id) => linked.find((t) => t.id === id)!.name);
  const title = names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
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
        kind: "quiz",
        title,
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
        kind: "generate_quiz",
        targetId: set.id,
        step: "retrieve",
        idempotencyKey: `generate_quiz:${set.id}`,
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

export async function listSets(user: SessionUser, spaceId: string, kind: "quiz" | "deck" | null): Promise<SetResponse[]> {
  const space = await requireSpace(spaceId, user);
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.spaceId, space.id), kind ? eq(studySets.kind, kind) : undefined))
    .orderBy(desc(studySets.createdAt));
  return rows.map(toSetResponse);
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

export async function deleteSet(user: SessionUser, setId: string): Promise<void> {
  const set = await requireSet(setId, user);
  // A still-running job sees the set gone at its next step and stops.
  await db.delete(studySets).where(eq(studySets.id, set.id));
}
