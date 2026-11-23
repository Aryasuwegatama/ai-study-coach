import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { safeTimeZone } from "@/lib/time-zone";
import { db } from "@/server/db/db-client";
import { attempts, deckSessions, studySets, studySpaces } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import {
  ACTIVITY_LATEST,
  ACTIVITY_WEEKS,
  type ActivityResponse,
  type ActivityWeek,
  type DeckSessionPoint,
  type QuizAttemptPoint,
} from "../progress-schemas";

/** Monday of the week a timestamp falls in, in the student's time zone, as `YYYY-MM-DD` (computed in SQL). */
const weekOf = (column: typeof attempts.submittedAt | typeof deckSessions.finishedAt, tz: string) =>
  sql<string>`to_char(date_trunc('week', ${column} at time zone ${tz}), 'YYYY-MM-DD')`;

/**
 * The student's quiz and flashcard activity (UI redesign, 2026-11-23): weekly
 * counts for the last `ACTIVITY_WEEKS` weeks, plus the latest submitted quiz
 * attempts and finished practice sessions, each as its own result. Only the
 * signed-in student's own rows in Study Spaces they own that aren't deleted;
 * `spaceId` narrows it to one space (checked with `requireSpace`). Read-only.
 */
export async function getActivity(user: SessionUser, spaceId: string | null): Promise<ActivityResponse> {
  const space = spaceId ? await requireSpace(spaceId, user) : null;
  const tz = safeTimeZone(user.timeZone);

  // The week starts, oldest first, and the first one's instant as the window's lower bound.
  const weekRows = await db.execute<{ week: string }>(sql`
    select to_char(gs, 'YYYY-MM-DD') as week
    from generate_series(
      date_trunc('week', now() at time zone ${tz}) - make_interval(weeks => ${ACTIVITY_WEEKS - 1}),
      date_trunc('week', now() at time zone ${tz}),
      interval '1 week'
    ) as gs
    order by gs
  `);
  const weekStarts = weekRows.rows.map((r) => r.week);
  const windowStart = sql`(date_trunc('week', now() at time zone ${tz}) - make_interval(weeks => ${ACTIVITY_WEEKS - 1})) at time zone ${tz}`;

  const ownedSpace = and(eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt), space ? eq(studySpaces.id, space.id) : undefined);

  const attemptBase = db
    .select({
      attemptId: attempts.id,
      setId: attempts.setId,
      spaceId: attempts.spaceId,
      title: studySets.title,
      spaceName: studySpaces.name,
      submittedAt: attempts.submittedAt,
      score: attempts.score,
      total: attempts.total,
      week: weekOf(attempts.submittedAt, tz),
    })
    .from(attempts)
    .innerJoin(studySets, eq(studySets.id, attempts.setId))
    .innerJoin(studySpaces, eq(studySpaces.id, attempts.spaceId));
  const attemptOwned = and(eq(attempts.studentId, user.id), eq(attempts.status, "submitted"), ownedSpace);

  const sessionBase = db
    .select({
      sessionId: deckSessions.id,
      setId: deckSessions.setId,
      spaceId: deckSessions.spaceId,
      title: studySets.title,
      spaceName: studySpaces.name,
      finishedAt: deckSessions.finishedAt,
      ratings: deckSessions.ratings,
      week: weekOf(deckSessions.finishedAt, tz),
    })
    .from(deckSessions)
    .innerJoin(studySets, eq(studySets.id, deckSessions.setId))
    .innerJoin(studySpaces, eq(studySpaces.id, deckSessions.spaceId));
  const sessionOwned = and(eq(deckSessions.studentId, user.id), eq(deckSessions.status, "completed"), ownedSpace);

  const [weekAttempts, latestAttempts, weekSessions, latestSessions] = await Promise.all([
    attemptBase.where(and(attemptOwned, gte(attempts.submittedAt, windowStart))),
    attemptBase.where(attemptOwned).orderBy(desc(attempts.submittedAt)).limit(ACTIVITY_LATEST),
    sessionBase.where(and(sessionOwned, gte(deckSessions.finishedAt, windowStart))),
    sessionBase.where(sessionOwned).orderBy(desc(deckSessions.finishedAt)).limit(ACTIVITY_LATEST),
  ]);

  const weeks: ActivityWeek[] = weekStarts.map((weekStart) => {
    const sessions = weekSessions.filter((s) => s.week === weekStart);
    return {
      weekStart,
      quizzes: weekAttempts.filter((a) => a.week === weekStart).length,
      flashcardSessions: sessions.length,
      cardsRated: sessions.reduce((sum, s) => sum + Object.keys(s.ratings).length, 0),
    };
  });

  const quizAttempts: QuizAttemptPoint[] = latestAttempts.reverse().map((a) => {
    const score = a.score ?? 0;
    return {
      attemptId: a.attemptId,
      setId: a.setId,
      spaceId: a.spaceId,
      title: a.title,
      spaceName: a.spaceName,
      submittedAt: a.submittedAt!.toISOString(),
      score,
      total: a.total,
      percent: a.total ? Math.round((score / a.total) * 100) : 0,
    };
  });

  const deckSessionPoints: DeckSessionPoint[] = latestSessions.reverse().map((s) => {
    const values = Object.values(s.ratings);
    const gotIt = values.filter((r) => r === "got_it").length;
    return {
      sessionId: s.sessionId,
      setId: s.setId,
      spaceId: s.spaceId,
      title: s.title,
      spaceName: s.spaceName,
      finishedAt: s.finishedAt!.toISOString(),
      gotIt,
      again: values.length - gotIt,
    };
  });

  return { weeks, quizAttempts, deckSessions: deckSessionPoints };
}
