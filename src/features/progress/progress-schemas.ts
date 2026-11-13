/**
 * Mastery and progress contract (T-14; PRD Section 2 "Mastery and
 * progress"). Mastery is a query over submitted quiz answers, never a
 * table, and revision or card ratings never change it.
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

export type SpaceProgress = { spaceId: string; spaceName: string; topics: TopicMastery[] };

export type CountedQuestion = { itemId: string; setId: string; prompt: string; isCorrect: boolean; answeredAt: string };
export type TopicMasteryDetail = { mastery: TopicMastery; questions: CountedQuestion[] };

/** The status rules, kept pure so they can be checked at their boundaries. */
export function masteryFrom(counted: number, correct: number): Pick<TopicMastery, "status" | "percent" | "needed"> {
  if (counted === 0) return { status: "not_assessed", percent: null, needed: MASTERY_MIN_EVIDENCE };
  if (counted < MASTERY_MIN_EVIDENCE) return { status: "insufficient", percent: null, needed: MASTERY_MIN_EVIDENCE - counted };
  const percent = Math.round((correct / counted) * 100);
  return { status: correct * 100 < WEAK_BELOW_PERCENT * counted ? "weak" : "on_track", percent, needed: 0 };
}
