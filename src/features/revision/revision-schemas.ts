import { z } from "zod";

/**
 * Review mistakes contract (T-15, replacing the T-14 revision schedule after
 * lecturer feedback on 13 November 2026: no schedule, no scheduled
 * re-attempts; PRD Section 2 "My Plan and reviewing mistakes", Section 4
 * tables 12–13). The `revision_items` table is the student's list of
 * mistakes: one row per student per question, created when a quiz answer is
 * wrong.
 *
 * Routes:
 * - `GET /api/revision/mistakes?topicId=` or `?spaceId=` → `MistakesResponse`:
 *   open mistakes, weak topics first, then oldest first, at most 20, with
 *   `total` counting every open mistake in that scope. Exactly one
 *   parameter; neither, both or a malformed one → 400 `VALIDATION_ERROR`.
 *   Someone else's topic → 404 `TOPIC_NOT_FOUND`; space → 404
 *   `SPACE_NOT_FOUND`. No correct index and no explanation.
 * - `POST /api/revision/items/:id/check` `CheckRequest` → `{ result:
 *   CheckResult }`. Checked on the server. Correct → the mistake is cleared;
 *   wrong → it stays open. The same `requestKey` returns the first result
 *   and records no second event. Missing, malformed, someone else's or no
 *   longer eligible → 404 `REVISION_ITEM_NOT_FOUND`.
 *
 * A later wrong quiz answer to the same question reopens a cleared mistake;
 * a later correct quiz answer clears an open one. Checks never touch
 * `attempt_items`, so they can never change mastery.
 */
export const MISTAKES_SESSION_SIZE = 20;

export const REVISION_API_ERRORS = {
  REVISION_ITEM_NOT_FOUND: { status: 404, message: "Mistake not found." },
} as const;
export type RevisionApiErrorCode = keyof typeof REVISION_API_ERRORS;

/** Exactly one of `topicId` and `spaceId`. */
export const mistakesQuerySchema = z
  .object({
    topicId: z.uuid("Choose a valid topic.").optional(),
    spaceId: z.uuid("Choose a valid Study Space.").optional(),
  })
  .refine((q) => (q.topicId === undefined) !== (q.spaceId === undefined), { message: "Send exactly one of topicId and spaceId." });
export type MistakesQuery = z.infer<typeof mistakesQuerySchema>;

export const checkSchema = z.object({
  requestKey: z.string().min(8).max(100),
  /** Index into the options as sent by the list. */
  selectedIndex: z.number().int().min(0).max(3),
});
export type CheckRequest = z.infer<typeof checkSchema>;

export type MistakeQuestion = { id: string; topicId: string; topicName: string; prompt: string; options: string[] };
export type MistakesResponse = { items: MistakeQuestion[]; total: number };

export type CheckResult = {
  outcome: "correct" | "incorrect";
  correctIndex: number;
  explanation: string | null;
  /** True when the mistake is no longer open after this check. */
  cleared: boolean;
};
