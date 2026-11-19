import type { AttemptResponse, SaveAnswerRequest } from "@/features/attempts/attempts-schemas";
import type { CreateQuizRequest, SetDetailResponse, SetResponse } from "../quizzes-schemas";
import type { AttemptQuestionWithTopicName, SetupMaterial, SetWithLatestAttempt } from "../fixtures/quizzes-sample-types";

/** Thrown by `QuizzesClient` methods for a server-shaped failure (a stable
 * `QUIZ_API_ERRORS`/`ATTEMPT_API_ERRORS` code and its message), so callers
 * can show the exact contract message without inspecting strings. */
export class QuizzesClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** An in-progress attempt's questions, with the topic name the attempt
 * screen shows next to each one (see `quizzes-sample-types.ts`, "Beyond
 * gaps 1–3"). Never carries an answer, explanation or source. */
export type ExampleAttemptResponse = Omit<AttemptResponse, "questions"> & {
  questions: AttemptQuestionWithTopicName[] | null;
};

/**
 * T-12a's data interface (issue #46, plan step 2): the one shape every
 * Quizzes/Attempt screen talks to for the Quiz Library, setup, taking an
 * attempt and viewing results. `example-quizzes-client.ts` is this task's
 * only implementation, built against the sample fixtures; T-12b adds the
 * real implementation against the live quiz and attempt routes, and no
 * component changes when it swaps over.
 *
 * `startOrResumeAttempt` covers "retake" too: the real
 * `POST /api/sets/:id/attempts` creates a new attempt whenever the
 * student has no in-progress attempt for that quiz — including right
 * after a submitted one — and resumes the in-progress one otherwise,
 * so one method (and one route) covers resume, first attempt and retake.
 */
export type QuizzesClient = {
  listSets(): Promise<SetWithLatestAttempt[]>;
  getSet(setId: string): Promise<SetDetailResponse>;
  createQuiz(request: CreateQuizRequest): Promise<SetResponse>;
  deleteSet(setId: string): Promise<void>;
  /** Setup's per-material confirmed-topics listing (gap 2). */
  listSetupMaterials(): Promise<SetupMaterial[]>;
  startOrResumeAttempt(setId: string): Promise<ExampleAttemptResponse>;
  getAttempt(attemptId: string): Promise<ExampleAttemptResponse>;
  saveAnswer(attemptId: string, request: SaveAnswerRequest): Promise<ExampleAttemptResponse>;
  submitAttempt(attemptId: string): Promise<ExampleAttemptResponse>;
};
