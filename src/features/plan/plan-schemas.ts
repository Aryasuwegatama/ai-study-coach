import { z } from "zod";

/**
 * My Plan contract (T-15; PRD Section 2 "My Plan and reviewing mistakes",
 * Section 4 table 14). Replaces the app-set revision schedule after
 * lecturer feedback on 13 November 2026: the app suggests what to focus on
 * from the student's analytics; the student decides what to study and when.
 * The app sets no days, flags nothing as late and sends no reminders.
 *
 * Routes (Zod on every body, `requireUser()` on every route, ownership
 * checked on the server for every id, a client-sent student id ignored):
 * - `GET /api/plan/items` → `{ items: PlanItemResponse[] }`: open items by
 *   planned day (no day last), then oldest first; then done items, newest
 *   done first.
 * - `POST /api/plan/items` `CreatePlanItemRequest` → 201 `{ item }`. The
 *   server checks the target is the student's and derives the Study Space
 *   from it; the wrong id for the kind → 400. Someone else's target → 404
 *   with that resource's code. At most 100 open items → 409 `PLAN_ITEM_LIMIT`.
 * - `PATCH /api/plan/items/:id` `UpdatePlanItemRequest` → `{ item }`.
 *   `stage` moves a card on the plan board (UI redesign, 2026-11-23):
 *   `todo` clears both stamps, `doing` stamps `startedAt` and clears
 *   `doneAt`, `done` stamps `doneAt`. `done: true/false` still works.
 * - `DELETE /api/plan/items/:id` → 204.
 * - Missing, malformed or someone else's item → 404 `PLAN_ITEM_NOT_FOUND`.
 * - `GET /api/plan/suggestions` → `{ suggestions: Suggestion[] }`, all of
 *   them, ranked (the screen shows 8, then "Show all").
 *
 * `plannedOn` is a plain calendar date the student picked (`YYYY-MM-DD`);
 * it is never compared with "today" anywhere. Links are never stored: the
 * server builds `href` from `kind` and the ids.
 */
export const MAX_OPEN_PLAN_ITEMS = 100;
export const PLAN_TITLE_MAX = 120;

export const PLAN_API_ERRORS = {
  PLAN_ITEM_NOT_FOUND: { status: 404, message: "Plan item not found." },
  PLAN_ITEM_LIMIT: { status: 409, message: "Your plan is full. Mark some items done or remove them first." },
} as const;
export type PlanApiErrorCode = keyof typeof PLAN_API_ERRORS;

export const PLAN_KINDS = ["own", "practise_topic", "review_mistakes", "resume_quiz", "review_topics", "practise_deck"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** Which one id each non-own kind points at. */
export const PLAN_TARGET_FIELD = {
  practise_topic: "topicId",
  review_mistakes: "topicId",
  resume_quiz: "setId",
  practise_deck: "setId",
  review_topics: "materialId",
} as const satisfies Record<Exclude<PlanKind, "own">, "topicId" | "setId" | "materialId">;

const title = z
  .string("Write a title for this item.")
  .trim()
  .min(1, "Write a title for this item.")
  .max(PLAN_TITLE_MAX, `Keep the title to ${PLAN_TITLE_MAX} characters or fewer.`);
const day = z.iso.date("Choose a valid date.");

/** Plan board columns. Derived from the stamps: `doneAt` → done; else `startedAt` → doing; else to do. */
export const PLAN_STAGES = ["todo", "doing", "done"] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];

export const createPlanItemSchema = z
  .object({
    kind: z.enum(PLAN_KINDS, "Choose a valid kind of plan item."),
    title,
    plannedOn: day.optional(),
    /** `own` only: the Study Space the item belongs to (optional). */
    spaceId: z.uuid("Choose a valid Study Space.").optional(),
    topicId: z.uuid("Choose a valid topic.").optional(),
    setId: z.uuid("Choose a valid quiz or deck.").optional(),
    materialId: z.uuid("Choose a valid material.").optional(),
  })
  .superRefine((value, ctx) => {
    // Exactly the id this kind points at; every other id is wrong for it.
    const allowed = value.kind === "own" ? "spaceId" : PLAN_TARGET_FIELD[value.kind];
    for (const field of ["spaceId", "topicId", "setId", "materialId"] as const) {
      const present = value[field] !== undefined;
      if (field === allowed ? !present && value.kind !== "own" : present) {
        ctx.addIssue({
          code: "custom",
          message: field === allowed ? `This kind of item needs a ${field}.` : `A ${value.kind} item can't have a ${field}.`,
          path: [field],
        });
      }
    }
  });
export type CreatePlanItemRequest = z.infer<typeof createPlanItemSchema>;

export const updatePlanItemSchema = z
  .object({
    title: title.optional(),
    /** A day the student picked, or null to clear it ("Anytime"). */
    plannedOn: day.nullable().optional(),
    done: z.boolean("Done must be true or false.").optional(),
    /** Move the card to a board column. Can't be sent together with `done`. */
    stage: z.enum(PLAN_STAGES, "Choose To do, Doing or Done.").optional(),
  })
  .refine((value) => value.done === undefined || value.stage === undefined, { message: "Send either done or stage, not both.", path: ["stage"] })
  .refine((value) => value.title !== undefined || value.plannedOn !== undefined || value.done !== undefined || value.stage !== undefined, {
    message: "Nothing to change.",
  });
export type UpdatePlanItemRequest = z.infer<typeof updatePlanItemSchema>;

export type PlanItemResponse = {
  id: string;
  kind: PlanKind;
  title: string;
  spaceId: string | null;
  spaceName: string | null;
  topicId: string | null;
  setId: string | null;
  materialId: string | null;
  /** Built on the server from `kind` and the ids; null for an own item or when the target is gone. */
  href: string | null;
  plannedOn: string | null;
  /** When the card moved to Doing; null when it's in To do. */
  startedAt: string | null;
  doneAt: string | null;
  /** The board column, worked out on the server from the two stamps. */
  stage: PlanStage;
  createdAt: string;
};

/** Suggestions in ranking order (PRD Section 2). */
export const SUGGESTION_KINDS = ["weak_topic", "mistakes", "not_enough_evidence", "unfinished_quiz", "unfinished_deck", "not_tested", "topic_review"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Exactly the body "Add to my plan" posts, apart from the `title`. */
export type SuggestionPlan = { kind: Exclude<PlanKind, "own">; topicId?: string; setId?: string; materialId?: string };

export type Suggestion = {
  key: string;
  kind: SuggestionKind;
  spaceId: string;
  spaceName: string;
  /** Short, and fit to become a plan item's title. */
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  plan: SuggestionPlan;
  /** True when an open plan item has the same kind and target. */
  inPlan: boolean;
};

/** A quiz the student started and hasn't submitted (the dashboard's Resume card). */
export type UnfinishedQuiz = {
  kind: "quiz";
  attemptId: string;
  setId: string;
  title: string;
  spaceId: string;
  spaceName: string;
  answered: number;
  total: number;
  href: string;
  /** Last answer (or the start): the dashboard shows whichever of a quiz and a deck was touched last. */
  lastActivityAt: string;
};

/** A flashcard deck the student started practising and hasn't finished (T-18). Ratings schedule nothing. */
export type UnfinishedDeck = {
  kind: "deck";
  sessionId: string;
  setId: string;
  title: string;
  spaceId: string;
  spaceName: string;
  rated: number;
  total: number;
  href: string;
  lastActivityAt: string;
};
