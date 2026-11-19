import type { AttemptQuestion, QuestionSource } from "@/features/attempts/attempts-schemas";
import type { SetResponse } from "../quizzes-schemas";

/**
 * Fixture-only extensions for the API gaps T-12a's issue (#46) leaves for
 * T-12b (sample-data rule, `docs/CONTRIBUTING.md` "File naming"). Every
 * screen in `quizzes`/`attempts` reads these shapes through
 * `QuizzesClient`, never `SetResponse`/`AttemptQuestion` directly, so
 * T-12b only has to delete this file and the real API additions take
 * over — no component changes.
 */

// ---------------------------------------------------------------------------
// Gap 1: latest attempt per quiz. `GET …/sets` doesn't return it, so the
// library can't otherwise know whether to offer Start, Resume, View
// results/Retake, or whether Delete is allowed.
// ---------------------------------------------------------------------------

export type LatestAttemptSummary =
  | { status: "none" }
  | { status: "in_progress"; attemptId: string; answeredCount: number; totalCount: number }
  | { status: "submitted"; attemptId: string; score: number; total: number; percent: number };

/**
 * T-12b: needs API — add `latestAttempt` and `hasResults` (or
 * equivalents) to `SetResponse`. `hasResults` is separate from
 * `latestAttempt` because a retake makes the latest attempt "in progress"
 * while an earlier submitted attempt still exists, and that earlier one
 * is what blocks Delete (`SET_HAS_RESULTS`, checked against every attempt
 * row by `quizzes-service.ts`).
 */
export type SetWithLatestAttempt = SetResponse & {
  latestAttempt: LatestAttemptSummary;
  /** True once any attempt on this quiz has been submitted. */
  hasResults: boolean;
};

// ---------------------------------------------------------------------------
// Gap 2: topics per Ready material. `GET /api/spaces/:spaceId/topics`
// doesn't say which material a topic belongs to, so the setup screen
// can't list each material with its own confirmed topics.
// ---------------------------------------------------------------------------

export type SetupTopic = { id: string; name: string };

/** T-12b: needs API — a per-material confirmed-topics listing. */
export type SetupMaterial = {
  id: string;
  name: string;
  /** Only `ready` materials are selectable; `review_topics` ones are shown, disabled. */
  status: "ready" | "review_topics";
  topics: SetupTopic[];
};

// ---------------------------------------------------------------------------
// Beyond gaps 1–3 (noted in the T-12a report, not one of the issue's listed
// gaps): `AttemptQuestion` carries only `topicId`, and no contract method
// returns topic names for an attempt still in progress (only
// `QuestionResult`, read after submit, carries `topicName`). The attempt
// screen needs the topic name next to each question while answering.
// ---------------------------------------------------------------------------

/** T-12b: needs API — an in-progress attempt's questions need a topic name. */
export type AttemptQuestionWithTopicName = AttemptQuestion & { topicName: string };

// ---------------------------------------------------------------------------
// The example library's internal answer key (sample-data rule). Never
// exposed as-is: `example-quizzes-client.ts` strips `correctIndex`,
// `explanation` and `sources` for every pre-submission response
// (`QuizItemPublic`/`AttemptQuestionWithTopicName`) and only reveals them
// once an attempt is submitted (`QuestionResult`).
// ---------------------------------------------------------------------------

export type QuizItemAnswerKey = {
  id: string;
  position: number;
  topicId: string;
  topicName: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: "easy" | "medium" | "hard" | null;
  explanation: string;
  /** Empty on exactly one item (the "Source removed" state). */
  sources: QuestionSource[];
};
