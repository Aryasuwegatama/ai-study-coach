import { and, eq, isNull, sql } from "drizzle-orm";
import { learningItems, revisionItems, studySpaces, topics } from "./schema";

/**
 * Which mistakes still count (T-15; PRD Section 2 "My Plan and reviewing
 * mistakes"): the student's own, in a live space, on a confirmed topic, the
 * question still `active` and still sourced (its material not deleted).
 *
 * Shared by Revision (the review list) and Progress (the per-topic counts)
 * so the two can never disagree. A query using it must join `revision_items`,
 * `learning_items`, `topics` and `study_spaces`.
 */
export const eligibleMistake = (studentId: string) =>
  and(
    eq(revisionItems.studentId, studentId),
    eq(studySpaces.ownerId, studentId),
    isNull(studySpaces.deletedAt),
    eq(topics.status, "confirmed"),
    eq(learningItems.status, "active"),
    sql`exists (select 1 from item_sources s where s.item_id = ${revisionItems.itemId})`,
  );

/** An eligible mistake that is still open (not cleared). */
export const openMistake = (studentId: string) => and(eligibleMistake(studentId), isNull(revisionItems.clearedAt));
