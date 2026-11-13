import { z } from "zod";

/**
 * Quiz attempts and scoring contract (T-14; PRD Section 2 "Quizzes",
 * Section 4 API table, security rules 4–5). Arya's attempt and results
 * screens (T-12) build against this file.
 *
 * Routes:
 * - `POST /api/sets/:id/attempts` → 201 `AttemptResponse` (new) or 200
 *   (resumes the student's in-progress attempt). One in-progress attempt
 *   per student per quiz. Each new attempt shuffles question and option
 *   order. A quiz that isn't `ready` → 409 `SET_NOT_READY`.
 * - `GET /api/attempts/:id` → `AttemptResponse`. While in progress it has
 *   questions and saved answers only; once submitted it has `result`.
 * - `PATCH /api/attempts/:id/answers` `SaveAnswerRequest` → 200
 *   `AttemptResponse`. `selectedIndex` is the *displayed* option index
 *   (0–3), or `null` to clear. A submitted attempt → 409 `ATTEMPT_SUBMITTED`.
 * - `POST /api/attempts/:id/submit` → 200 `AttemptResponse` with `result`.
 *   The body is ignored: the server scores. Submitting twice returns the
 *   same result. Wrong answers create review items due the next local day.
 * - Missing, malformed or someone else's attempt: 404 `ATTEMPT_NOT_FOUND`.
 */

export const ATTEMPT_API_ERRORS = {
  ATTEMPT_NOT_FOUND: { status: 404, message: "Attempt not found." },
  SET_NOT_READY: { status: 409, message: "This quiz isn't ready yet." },
  ATTEMPT_SUBMITTED: { status: 409, message: "This attempt was already submitted." },
  ITEM_NOT_IN_ATTEMPT: { status: 400, message: "That question isn't part of this attempt." },
} as const;
export type AttemptApiErrorCode = keyof typeof ATTEMPT_API_ERRORS;

export const saveAnswerSchema = z.object({
  itemId: z.uuid("Choose a valid question."),
  selectedIndex: z.number().int().min(0).max(3).nullable(),
});
export type SaveAnswerRequest = z.infer<typeof saveAnswerSchema>;

export type AttemptQuestion = {
  itemId: string;
  position: number;
  topicId: string;
  prompt: string;
  /** In this attempt's shuffled order. */
  options: string[];
  /** Displayed index, or null when unanswered. */
  selectedIndex: number | null;
};

export type QuestionSource = { chunkId: string; materialName: string; pages: string; excerpt: string };

export type QuestionResult = AttemptQuestion & {
  topicName: string;
  /** Displayed index of the correct option. */
  correctIndex: number;
  isCorrect: boolean;
  explanation: string | null;
  /** Empty when every cited material was deleted: show "Source removed". */
  sources: QuestionSource[];
  aiGenerated: true;
};

export type AttemptResult = {
  score: number;
  total: number;
  percent: number;
  topics: { topicId: string; topicName: string; correct: number; total: number }[];
  questions: QuestionResult[];
};

export type AttemptResponse = {
  id: string;
  setId: string;
  status: "in_progress" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  /** Only while in progress. */
  questions: AttemptQuestion[] | null;
  /** Only once submitted. */
  result: AttemptResult | null;
};
