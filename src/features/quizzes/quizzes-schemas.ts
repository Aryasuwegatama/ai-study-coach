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
 * - `GET /api/spaces/:spaceId/sets?kind=quiz` → `{ sets: SetListItemResponse[] }`,
 *   newest first (T-12b: `latestAttempt`, `hasResults` and `activeCount`
 *   added to each set, computed in one query for the whole list — not one
 *   per quiz). Only this route returns the extra fields; `POST …/sets` and
 *   `GET /api/sets/:id` keep returning plain `SetResponse`.
 * - `GET /api/sets/:id` → `SetDetailResponse`. Items never include the
 *   correct option, explanation or sources (answers only come back from a
 *   submitted attempt, T-14).
 * - `DELETE /api/sets/:id` → 204 for a quiz with no submitted attempt
 *   (failed, generating, never attempted, or only in progress; an
 *   in-progress attempt goes with it). A quiz with a submitted attempt →
 *   409 `SET_HAS_RESULTS`: its results, mastery evidence and revision items
 *   are the student's record (Arya, 2026-11-14, #35).
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
export const CARD_COUNT_MIN = 1;
export const CARD_COUNT_MAX = 20;
export const CARD_STYLES = ["recall", "short_answer", "mix"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
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
  SET_HAS_RESULTS: { status: 409, message: "This quiz has results, so it can't be deleted." },
} as const;
export type QuizApiErrorCode = keyof typeof QUIZ_API_ERRORS;

/** `TOO_MANY_TOPICS` for a deck names cards, not questions (PRD Section 2 "Flashcards"). */
export const TOO_MANY_TOPICS_DECK_MESSAGE = "Select fewer topics or increase the number of cards, so every topic gets at least one.";

/** Stored on a `failed` set and shown next to Try again. */
export const SET_FAILURE_REASONS = {
  TOO_FEW_QUESTIONS: "Not enough good questions could be written from these sources. Try again or choose more topics.",
  NO_CARDS: "No good cards could be written from these sources. Try again or choose more topics.",
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

const materialAndTopicIds = {
  materialIds: uuidList("materials"),
  topicIds: uuidList("topics"),
};

/** A quiz's or deck's name: the student's own, or "Quiz 3" / "Deck 3" when left blank (UI redesign, Arya, 2026-11-23). */
export const SET_TITLE_MAX = 80;
const setTitle = z
  .string("Give it a name.")
  .trim()
  .min(1, "Give it a name.")
  .max(SET_TITLE_MAX, `Keep the name to ${SET_TITLE_MAX} characters or fewer.`);

export const createQuizSchema = z.object({
  kind: z.literal("quiz"),
  ...materialAndTopicIds,
  /** Optional: left out, the server names it "Quiz N" (the next number in that space). */
  title: setTitle.optional(),
  count: z.union(QUESTION_COUNTS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>, z.ZodLiteral<20>], {
    error: "Choose 5, 10, 15 or 20 questions.",
  }),
});
export type CreateQuizRequest = z.infer<typeof createQuizSchema>;

export const createDeckSchema = z.object({
  kind: z.literal("deck"),
  ...materialAndTopicIds,
  cardStyle: z.enum(CARD_STYLES, { error: "Choose Recall, Short answer or Mix." }),
  /** Optional: left out, the server names it "Deck N" (the next number in that space). */
  title: setTitle.optional(),
  count: z
    .number({ error: `Choose between ${CARD_COUNT_MIN} and ${CARD_COUNT_MAX} cards.` })
    .int(`Choose between ${CARD_COUNT_MIN} and ${CARD_COUNT_MAX} cards.`)
    .min(CARD_COUNT_MIN, `Choose between ${CARD_COUNT_MIN} and ${CARD_COUNT_MAX} cards.`)
    .max(CARD_COUNT_MAX, `Choose between ${CARD_COUNT_MIN} and ${CARD_COUNT_MAX} cards.`),
});
export type CreateDeckRequest = z.infer<typeof createDeckSchema>;

export const createSetSchema = z.discriminatedUnion("kind", [createQuizSchema, createDeckSchema], {
  error: "Choose whether to generate a quiz or a deck of flashcards.",
});
export type CreateSetRequest = z.infer<typeof createSetSchema>;

/** `PATCH /api/sets/:id`: rename a quiz (or deck). Nothing else about a set can be edited. */
export const renameSetSchema = z.object({ title: setTitle });
export type RenameSetRequest = z.infer<typeof renameSetSchema>;

export type SetResponse = {
  id: string;
  kind: "quiz" | "deck";
  title: string;
  /** Decks only (null for a quiz). */
  cardStyle: CardStyle | null;
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

/** The student's newest attempt on a quiz (T-12b, gap 1): `none`, in
 * progress or submitted. Needed by the library to decide between Start,
 * Resume and View results/Retake. */
export type LatestAttemptSummary =
  | { status: "none" }
  | { status: "in_progress"; attemptId: string; answeredCount: number; totalCount: number }
  | { status: "submitted"; attemptId: string; score: number; total: number; percent: number };

/**
 * `GET /api/spaces/:spaceId/sets`'s per-quiz list fields (T-12b, gap 1).
 * `hasResults` is separate from `latestAttempt` because a retake makes the
 * latest attempt "in progress" while an earlier submitted attempt still
 * exists, and that earlier one is what blocks Delete (`SET_HAS_RESULTS`,
 * checked against every attempt row by `quizzes-service.ts`).
 * `activeCount` is the quiz's `active` (not reported-and-removed)
 * question count, used by the library to show "every question removed"
 * instead of Start/Retake (`SET_NO_ACTIVE_QUESTIONS`).
 */
export type SetListItemResponse = SetResponse & {
  latestAttempt: LatestAttemptSummary;
  hasResults: boolean;
  activeCount: number;
  /** The quiz's topics with their current names, in the order chosen (shown as tags). */
  topics: { id: string; name: string }[];
};

/** Lower case, punctuation and extra spaces removed (the duplicate-question check). */
export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** An option label the AI sometimes writes despite the prompt: "A ", "A. ", "A) ", "(A) ", "A: ", "A - ". */
const OPTION_LABEL = /^\s*\(?([A-D])(?:[.):-]\s*|\s+)/i;

/**
 * Removes AI-written option labels before a question is saved, since the
 * app shuffles options and labels them A–D by position itself (T-12b).
 * Only strips when the four options carry A, B, C and D exactly once
 * each, so real text like four options all starting "A table …" stays.
 */
export function stripOptionLabels(options: string[]): string[] {
  const letters = options.map((o) => OPTION_LABEL.exec(o)?.[1]?.toUpperCase());
  if (options.length !== 4 || [...new Set(letters)].sort().join("") !== "ABCD") return options;
  return options.map((o) => o.replace(OPTION_LABEL, "").trim() || o);
}

/** Spread `count` questions as evenly as possible over topics; earlier topics take the remainder. */
export function spreadQuestions(count: number, topicCount: number): number[] {
  return Array.from({ length: topicCount }, (_, i) => Math.floor(count / topicCount) + (i < count % topicCount ? 1 : 0));
}
