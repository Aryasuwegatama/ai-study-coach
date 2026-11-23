import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { attempts, studySpaces } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import { getSuggestions, getUnfinishedDecks, getUnfinishedQuizzes, type Suggestion, type UnfinishedDeck, type UnfinishedQuiz } from "@/features/plan/server";
import { getAllProgress } from "@/features/progress/server";

export const DASHBOARD_SUGGESTIONS = 3;

/**
 * What the dashboard shows (T-15; PRD Section 2 "Dashboard"): four plain
 * numbers, the latest unfinished quiz or flashcard deck and the top suggestions. Never an
 * overall accuracy or an average across topics, and no dates.
 */
export type DashboardSummary = {
  activeSpaces: number;
  /** Submitted attempts, in spaces that aren't deleted. */
  quizzesCompleted: number;
  /** Weak topics across all spaces. */
  weakTopics: number;
  /** Open mistakes across all spaces. */
  openMistakes: number;
  /** Whichever unfinished quiz or deck was touched last; `kind` says which. */
  resume: UnfinishedQuiz | UnfinishedDeck | null;
  suggestions: Suggestion[];
};

export async function getDashboardSummary(user: SessionUser): Promise<DashboardSummary> {
  const [progress, unfinished, unfinishedDecks, [{ completed }]] = await Promise.all([
    getAllProgress(user),
    getUnfinishedQuizzes(user),
    getUnfinishedDecks(user),
    db
      .select({ completed: count() })
      .from(attempts)
      .innerJoin(studySpaces, eq(studySpaces.id, attempts.spaceId))
      .where(and(eq(attempts.studentId, user.id), eq(attempts.status, "submitted"), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt))),
  ]);
  const topics = progress.flatMap((space) => space.topics);
  const suggestions = await getSuggestions(user, { progress, unfinished, unfinishedDecks });
  const resume = [unfinished[0], unfinishedDecks[0]]
    .filter((x) => x !== undefined)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];

  return {
    activeSpaces: progress.length,
    quizzesCompleted: completed,
    weakTopics: topics.filter((t) => t.status === "weak").length,
    openMistakes: topics.reduce((sum, t) => sum + t.mistakes, 0),
    resume: resume ?? null,
    suggestions: suggestions.slice(0, DASHBOARD_SUGGESTIONS),
  };
}
