/**
 * Mastery and progress contract (T-14, extended in T-15; PRD Section 2
 * "Mastery and progress"). Mastery is a query over submitted quiz answers,
 * never a table, and reviewing mistakes or card ratings never change it.
 * These routes serve the My Analytics and Study Space Analytics screens.
 *
 * Routes:
 * - `GET /api/progress` → `{ spaces: SpaceProgress[] }` (all spaces).
 * - `GET /api/spaces/:spaceId/progress` → `SpaceProgress`, weak topics first.
 * - `GET /api/topics/:id/mastery` → `TopicMasteryDetail`, with the
 *   questions counted. Someone else's topic → 404 `TOPIC_NOT_FOUND`.
 *
 * Per confirmed topic: the latest submitted answer to each distinct
 * question (unanswered and removed questions skipped), newest 10.
 * 0 → `not_assessed`; 1–4 → `insufficient` ("3 of 5 needed", no
 * percentage); 5+ below 60% → `weak`; otherwise `on_track`.
 */
export const MASTERY_WINDOW = 10;
export const MASTERY_MIN_EVIDENCE = 5;
export const WEAK_BELOW_PERCENT = 60;

export type MasteryStatus = "not_assessed" | "insufficient" | "weak" | "on_track";

export type TopicMastery = {
  topicId: string;
  name: string;
  status: MasteryStatus;
  /** Questions counted (at most 10). */
  counted: number;
  correct: number;
  /** Null unless at least 5 questions are counted. */
  percent: number | null;
  /** Questions still needed for a percentage ("3 of 5 needed"). */
  needed: number;
};

/**
 * What the Analytics screens need beyond mastery (T-15). `hasReadyMaterial`:
 * the topic is linked to at least one `ready` material (false for a topic
 * whose materials were all deleted; it drives "Practise" and the "No
 * material" pill). `mistakes`: its open mistakes, with the same eligibility
 * as the review list.
 */
export type TopicProgress = TopicMastery & { hasReadyMaterial: boolean; mistakes: number };

export type SpaceProgress = { spaceId: string; spaceName: string; topics: TopicProgress[] };

export type CountedQuestion = { itemId: string; setId: string; prompt: string; isCorrect: boolean; answeredAt: string };
export type TopicMasteryDetail = {
  mastery: TopicMastery;
  questions: CountedQuestion[];
  /** So the topic page can check the topic belongs to the space in its URL. */
  spaceId: string;
  hasReadyMaterial: boolean;
  mistakes: number;
};

/** The status rules, kept pure so they can be checked at their boundaries. */
export function masteryFrom(counted: number, correct: number): Pick<TopicMastery, "status" | "percent" | "needed"> {
  if (counted === 0) return { status: "not_assessed", percent: null, needed: MASTERY_MIN_EVIDENCE };
  if (counted < MASTERY_MIN_EVIDENCE) return { status: "insufficient", percent: null, needed: MASTERY_MIN_EVIDENCE - counted };
  const percent = Math.round((correct / counted) * 100);
  return { status: correct * 100 < WEAK_BELOW_PERCENT * counted ? "weak" : "on_track", percent, needed: 0 };
}

/**
 * Study activity for the Analytics "Your activity" card (UI redesign, Arya,
 * 2026-11-23). Counts and individual results only: never an average, an
 * overall score, a streak or a goal. Weeks start on Monday in the student's
 * own time zone and are worked out in SQL.
 */
export const ACTIVITY_WEEKS = 8;
/** How many of the latest quiz attempts and finished practice sessions are charted. */
export const ACTIVITY_LATEST = 10;

export type ActivityWeek = {
  /** Monday of that week, `YYYY-MM-DD`, in the student's time zone. */
  weekStart: string;
  quizzes: number;
  flashcardSessions: number;
  /** Cards rated in the practice sessions finished that week. */
  cardsRated: number;
};

/** One submitted quiz attempt, as its own result (never averaged). */
export type QuizAttemptPoint = {
  attemptId: string;
  setId: string;
  spaceId: string;
  title: string;
  spaceName: string;
  submittedAt: string;
  score: number;
  total: number;
  percent: number;
};

/** One finished flashcard practice session: how the student rated their cards. */
export type DeckSessionPoint = {
  sessionId: string;
  setId: string;
  spaceId: string;
  title: string;
  spaceName: string;
  finishedAt: string;
  gotIt: number;
  again: number;
};

export type ActivityResponse = {
  /** The last `ACTIVITY_WEEKS` weeks, oldest first, including weeks with nothing. */
  weeks: ActivityWeek[];
  /** The latest `ACTIVITY_LATEST` submitted attempts, oldest first. */
  quizAttempts: QuizAttemptPoint[];
  /** The latest `ACTIVITY_LATEST` finished practice sessions, oldest first. */
  deckSessions: DeckSessionPoint[];
};
