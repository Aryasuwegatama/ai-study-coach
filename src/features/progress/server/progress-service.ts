import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { openMistake } from "@/server/db/mistake-filter";
import { learningItems, materialTopics, materials, revisionItems, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { requireTopic } from "@/features/topics/server";
import {
  MASTERY_WINDOW,
  masteryFrom,
  type CountedQuestion,
  type SpaceProgress,
  type TopicMastery,
  type TopicMasteryDetail,
  type TopicProgress,
} from "../progress-schemas";

type CountedRow = { topic_id: string; item_id: string; set_id: string; prompt: string; is_correct: boolean; submitted_at: Date | string };

/**
 * The mastery query (PRD Section 4: "Mastery is a query, not a table").
 * For one student and some topics: submitted, answered, still-active quiz
 * questions; the latest answer per question; then the newest 10 per topic
 * (timestamp, then id, as the tie-breaker).
 */
export async function countedAnswers(studentId: string, topicIds: string[]): Promise<CountedRow[]> {
  if (!topicIds.length) return [];
  const result = await db.execute<CountedRow>(sql`
    with answers as (
      select li.topic_id, ai.item_id, ai.set_id, li.prompt, ai.is_correct, a.submitted_at, a.id as attempt_id,
             row_number() over (partition by ai.item_id order by a.submitted_at desc, a.id desc) as latest
      from attempt_items ai
      join attempts a on a.id = ai.attempt_id
      join learning_items li on li.id = ai.item_id
      where a.student_id = ${studentId}
        and a.status = 'submitted'
        and ai.selected_index is not null
        and li.status = 'active'
        and li.kind = 'mcq'
        and li.topic_id in ${topicIds}
    ), ranked as (
      select *, row_number() over (partition by topic_id order by submitted_at desc, item_id desc) as k
      from answers where latest = 1
    )
    select topic_id, item_id, set_id, prompt, is_correct, submitted_at from ranked
    where k <= ${MASTERY_WINDOW}
    order by topic_id, submitted_at desc, item_id desc
  `);
  return result.rows;
}

/** Mastery for each topic, in the given order. */
export async function masteryFor(studentId: string, topicRows: { id: string; name: string }[]): Promise<TopicMastery[]> {
  const rows = await countedAnswers(studentId, topicRows.map((t) => t.id));
  return topicRows.map((t) => {
    const mine = rows.filter((r) => r.topic_id === t.id);
    const correct = mine.filter((r) => r.is_correct).length;
    return { topicId: t.id, name: t.name, counted: mine.length, correct, ...masteryFrom(mine.length, correct) };
  });
}

/** Which of these topics have a Ready material, and how many open mistakes each has: one query each, not one per topic. */
async function topicExtras(studentId: string, topicIds: string[]): Promise<{ ready: Set<string>; mistakes: Map<string, number> }> {
  if (!topicIds.length) return { ready: new Set(), mistakes: new Map() };
  const linked = await db
    .selectDistinct({ topicId: materialTopics.topicId })
    .from(materialTopics)
    .innerJoin(materials, eq(materials.id, materialTopics.materialId))
    .where(and(inArray(materialTopics.topicId, topicIds), eq(materials.status, "ready")));
  const counts = await db
    .select({ topicId: revisionItems.topicId, n: sql<number>`count(*)::int` })
    .from(revisionItems)
    .innerJoin(learningItems, eq(learningItems.id, revisionItems.itemId))
    .innerJoin(topics, eq(topics.id, revisionItems.topicId))
    .innerJoin(studySpaces, eq(studySpaces.id, revisionItems.spaceId))
    .where(and(openMistake(studentId), inArray(revisionItems.topicId, topicIds)))
    .groupBy(revisionItems.topicId);
  return { ready: new Set(linked.map((l) => l.topicId)), mistakes: new Map(counts.map((c) => [c.topicId, c.n])) };
}

const ORDER: Record<TopicMastery["status"], number> = { weak: 0, insufficient: 1, not_assessed: 2, on_track: 3 };
const weakFirst = (a: TopicMastery, b: TopicMastery) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name);

async function spaceProgress(user: SessionUser, space: { id: string; name: string }): Promise<SpaceProgress> {
  const confirmed = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.spaceId, space.id), eq(topics.status, "confirmed")))
    .orderBy(asc(topics.name));
  const mastery = await masteryFor(user.id, confirmed);
  const { ready, mistakes } = await topicExtras(user.id, confirmed.map((t) => t.id));
  const withExtras: TopicProgress[] = mastery.map((m) => ({ ...m, hasReadyMaterial: ready.has(m.topicId), mistakes: mistakes.get(m.topicId) ?? 0 }));
  return { spaceId: space.id, spaceName: space.name, topics: withExtras.sort(weakFirst) };
}

export async function getSpaceProgress(user: SessionUser, spaceId: string): Promise<SpaceProgress> {
  return spaceProgress(user, await requireSpace(spaceId, user));
}

export async function getAllProgress(user: SessionUser): Promise<SpaceProgress[]> {
  const spaces = await db
    .select({ id: studySpaces.id, name: studySpaces.name })
    .from(studySpaces)
    .where(and(eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .orderBy(asc(studySpaces.name));
  // ponytail: one mastery query per space; batch across spaces if My Analytics gets slow.
  return Promise.all(spaces.map((s) => spaceProgress(user, s)));
}

export async function getTopicMastery(user: SessionUser, topicId: string): Promise<TopicMasteryDetail> {
  const topic = await requireTopic(topicId, user);
  const [mastery] = await masteryFor(user.id, [topic]);
  const rows = await countedAnswers(user.id, [topic.id]);
  const questions: CountedQuestion[] = rows.map((r) => ({
    itemId: r.item_id,
    setId: r.set_id,
    prompt: r.prompt,
    isCorrect: r.is_correct,
    answeredAt: new Date(r.submitted_at).toISOString(),
  }));
  const { ready, mistakes } = await topicExtras(user.id, [topic.id]);
  return { mastery, questions, spaceId: topic.spaceId, hasReadyMaterial: ready.has(topic.id), mistakes: mistakes.get(topic.id) ?? 0 };
}

/** Topic ids among these that are weak for the student (the mistakes list's "weak first"). */
export async function weakTopicIds(studentId: string, topicIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(topicIds)];
  const ids = unique.length ? (await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, unique))) : [];
  return new Set((await masteryFor(studentId, ids)).filter((m) => m.status === "weak").map((m) => m.topicId));
}
