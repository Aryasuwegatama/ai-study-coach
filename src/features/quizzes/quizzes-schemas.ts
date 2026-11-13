import { z } from "zod";

/**
 * Quiz generation API contract (T-11a; PRD Section 2 "Quizzes", Section 3
 * Pipeline B, Section 4 API table). Arya's quiz screens (T-12) build
 * against this file; T-11b implements it.
 *
 * Routes:
 * - `POST /api/spaces/:spaceId/sets` `CreateQuizRequest` → 202
 *   `{ set: SetResponse }` with status `generating`. Checked in order:
 *   1. every material is in this space and `ready` (else 400
 *      `MATERIAL_NOT_READY`; another space's id is the same 400, never a hint);
 *   2. every topic is a confirmed topic of at least one chosen material
 *      (else 400 `TOPIC_NOT_IN_MATERIALS`);
 *   3. topics ≤ question count (else 400 `TOO_MANY_TOPICS`);
 *   4. fewer than `DAILY_GENERATION_LIMIT` generations since local midnight
 *      in the student's time zone (else 429 `DAILY_LIMIT_REACHED`).
 * - `GET /api/spaces/:spaceId/sets?kind=quiz` → `{ sets: SetResponse[] }`,
 *   newest first.
 * - `GET /api/sets/:id` → `SetDetailResponse`. Items never include the
 *   correct option, explanation or sources (answers only come back from a
 *   submitted attempt, T-14).
 * - `DELETE /api/sets/:id` → 204. Past attempts on it go with it
 *   (ponytail: retention is decided with account deletion).
 * - Missing, malformed or someone else's set: 404 `SET_NOT_FOUND`.
 *
 * Generation (PRD Section 3, Pipeline B): retrieve up to 8 chunks per
 * topic from the chosen materials only; write questions in bounded calls
 * (at most 40 sources each) with `[S1]`/`[T1]` labels; code checks (4
 * distinct options, topic and source labels from the list, no duplicate
 * prompts in the quiz or already published for the topic); an AI answer
 * check; one top-up round; publish with at least `MIN_PUBLISHED_QUESTIONS`.
 * Questions are spread as evenly as possible across topics.
 */

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const MIN_PUBLISHED_QUESTIONS = 5;
export const DAILY_GENERATION_LIMIT = 20;
export const MAX_ACTIVE_GENERATIONS = 2;
export const MAX_CHUNKS_PER_TOPIC = 8;
export const MAX_SOURCES_PER_REQUEST = 40;
/** A topic backed by fewer than two chunks gets at most this many questions (PRD Section 3). */
export const MAX_QUESTIONS_THIN_TOPIC = 3;
export const SET_POLL_INTERVAL_MS = 3000;

export const SET_STATUSES = ["generating", "ready", "failed"] as const;
export type SetStatus = (typeof SET_STATUSES)[number];

export const QUIZ_API_ERRORS = {
  SET_NOT_FOUND: { status: 404, message: "Quiz not found." },
  MATERIAL_NOT_READY: { status: 400, message: "Choose materials whose topics are confirmed." },
  TOPIC_NOT_IN_MATERIALS: { status: 400, message: "Choose topics from the selected materials." },
  TOO_MANY_TOPICS: {
    status: 400,
    message: "Select fewer topics or increase the number of questions, so every topic gets at least one.",
  },
  DAILY_LIMIT_REACHED: { status: 429, message: "Daily limit reached, try again tomorrow." },
} as const;
export type QuizApiErrorCode = keyof typeof QUIZ_API_ERRORS;

/** Stored on a `failed` set and shown next to Try again. */
export const SET_FAILURE_REASONS = {
  TOO_FEW_QUESTIONS: "Not enough good questions could be written from these sources. Try again or choose more topics.",
  AI_UNUSABLE_ANSWER: "The AI returned an unusable answer; please try again",
  GENERATION_FAILED: "Generation failed. Try again.",
} as const;
export type SetFailureCode = keyof typeof SET_FAILURE_REASONS;

const uuidList = (label: string) =>
  z
    .array(z.uuid(`Choose valid ${label}.`), { error: `Choose at least one of the ${label}.` })
    .min(1, `Choose at least one of the ${label}.`)
    .max(50)
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

export const createQuizSchema = z.object({
  kind: z.literal("quiz", { error: "Only quizzes can be generated for now." }),
  materialIds: uuidList("materials"),
  topicIds: uuidList("topics"),
  count: z.union(QUESTION_COUNTS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>, z.ZodLiteral<20>], {
    error: "Choose 5, 10, 15 or 20 questions.",
  }),
});
export type CreateQuizRequest = z.infer<typeof createQuizSchema>;

export type SetResponse = {
  id: string;
  kind: "quiz" | "deck";
  title: string;
  status: SetStatus;
  requestedCount: number;
  /** "8 of 10 generated" when lower than `requestedCount`. */
  generatedCount: number;
  materialIds: string[];
  topicIds: string[];
  error: { code: SetFailureCode; message: string } | null;
  createdAt: string;
  updatedAt: string;
};

/** A question as the browser sees it before submission: no answer, explanation or sources. */
export type QuizItemPublic = {
  id: string;
  position: number;
  topicId: string;
  prompt: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard" | null;
};

export type SetDetailResponse = { set: SetResponse; items: QuizItemPublic[] };

/** Lower case, punctuation and extra spaces removed (the duplicate-question check). */
export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spread `count` questions as evenly as possible over topics; earlier topics take the remainder. */
export function spreadQuestions(count: number, topicCount: number): number[] {
  return Array.from({ length: topicCount }, (_, i) => Math.floor(count / topicCount) + (i < count % topicCount ? 1 : 0));
}
