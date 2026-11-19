import { z } from "zod";

/**
 * Report an issue API contract (T-12b; PRD Section 2 "Reports", Section 4
 * table 14). The Results answer review (one report button per question,
 * `src/features/attempts/components/answer-review-list.tsx`) builds
 * against this file.
 *
 * Route:
 * - `POST /api/items/:id/report` `CreateReportRequest` → 201
 *   `{ report: ReportResponse }`.
 * - Missing, malformed or another student's item: 404 `ITEM_NOT_FOUND`.
 * - A second report on the same question by the same student: 409
 *   `ITEM_ALREADY_REPORTED`.
 * - Invalid body: 400 `VALIDATION_ERROR`.
 *
 * "Remove from my practice" sets the item's `learning_items.status` to
 * `removed` in the same transaction as the insert. Generation, attempts,
 * mastery and revision already filter on `status = 'active'`, so nothing
 * else changes; past results keep their scores (PRD Section 2, "Mastery
 * and progress"). One report per student per question, never edited or
 * withdrawn in Core: there is no restore and no PATCH/DELETE here.
 */

export const MAX_REPORT_COMMENT = 500;

export const REPORT_REASONS = ["incorrect_answer", "unclear_wording", "wrong_source", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Labels for the Report issue dialog's radio group. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  incorrect_answer: "The marked answer is incorrect",
  unclear_wording: "The question or an option is unclear",
  wrong_source: "This doesn't match the source material",
  other: "Something else",
};

export const REPORT_API_ERRORS = {
  ITEM_NOT_FOUND: { status: 404, message: "Question not found." },
  ITEM_ALREADY_REPORTED: { status: 409, message: "You've already reported this question." },
} as const;
export type ReportApiErrorCode = keyof typeof REPORT_API_ERRORS;

export const createReportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { error: "Choose a reason." }),
  comment: z
    .string()
    .trim()
    .max(MAX_REPORT_COMMENT, `Use ${MAX_REPORT_COMMENT} characters or fewer.`)
    .optional(),
  removeFromPractice: z.boolean({ error: "Choose whether to remove this question from your practice." }),
});
export type CreateReportRequest = z.infer<typeof createReportSchema>;

export type ReportResponse = {
  itemId: string;
  reason: ReportReason;
  removedFromPractice: boolean;
  createdAt: string;
};
