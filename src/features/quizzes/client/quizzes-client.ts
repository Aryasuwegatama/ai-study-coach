import type { AttemptResponse, SaveAnswerRequest } from "@/features/attempts/attempts-schemas";
import type { CreateReportRequest, ReportResponse } from "@/features/reports/reports-schemas";
import type { CreateQuizRequest, SetDetailResponse, SetListItemResponse, SetResponse } from "../quizzes-schemas";

/** Thrown by `QuizzesClient` methods for a server-shaped failure (a stable
 * `QUIZ_API_ERRORS`/`ATTEMPT_API_ERRORS`/`REPORT_API_ERRORS` code and its
 * message), so callers can show the exact contract message without
 * inspecting strings. */
export class QuizzesClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * T-12b's data interface: the one shape every Quizzes/Attempt screen
 * talks to for the Quiz Library, taking an attempt and viewing results.
 * `api-quizzes-client.ts` is the real implementation against the live
 * quiz, attempt and report routes (T-12a's sample-fixture implementation
 * is gone — issue #49).
 *
 * The setup screen talks to the Materials and Topics clients directly
 * instead of a `listSetupMaterials()` method here (gap 2: `materialIds`
 * on `TopicResponse` is enough to join them client-side); it still uses
 * `getSet` for a failed quiz's "Try again" prefill.
 *
 * `startOrResumeAttempt` covers "retake" too: the real
 * `POST /api/sets/:id/attempts` creates a new attempt whenever the
 * student has no in-progress attempt for that quiz — including right
 * after a submitted one — and resumes the in-progress one otherwise,
 * so one method (and one route) covers resume, first attempt and retake.
 */
export type QuizzesClient = {
  listSets(): Promise<SetListItemResponse[]>;
  getSet(setId: string): Promise<SetDetailResponse>;
  createQuiz(request: CreateQuizRequest): Promise<SetResponse>;
  deleteSet(setId: string): Promise<void>;
  startOrResumeAttempt(setId: string): Promise<AttemptResponse>;
  getAttempt(attemptId: string): Promise<AttemptResponse>;
  saveAnswer(attemptId: string, request: SaveAnswerRequest): Promise<AttemptResponse>;
  submitAttempt(attemptId: string): Promise<AttemptResponse>;
  reportItem(itemId: string, request: CreateReportRequest): Promise<ReportResponse>;
};
