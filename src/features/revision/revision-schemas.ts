import { z } from "zod";

/**
 * My Revision contract (T-14; PRD Section 2 "Revision"; Section 4,
 * tables 12–13). Dates are `YYYY-MM-DD` in the student's local calendar.
 *
 * Routes:
 * - `GET /api/revision` → `RevisionListResponse`: Overdue, Today and the
 *   next 7 days, weak topics first within each group.
 * - `POST /api/revision/session` `{ spaceId? }` → `{ items:
 *   RevisionSessionItem[] }`: up to 20 due items, weak topics first, no
 *   answers.
 * - `POST /api/revision/items/:id/review` `ReviewRequest` → `ReviewResult`.
 *   MCQs are checked on the server: right = Got it, wrong = Again. The same
 *   `requestKey` returns the first result without moving the schedule
 *   again. An item that isn't due yet → 409 `REVISION_NOT_DUE`.
 * - Missing, malformed or someone else's item: 404 `REVISION_ITEM_NOT_FOUND`.
 *
 * Schedule: created due tomorrow (1 day); first success → 3 days; second
 * and later → 7; any failure → 1 day and the streak resets. Revision never
 * changes mastery. Removed questions and ones whose material was deleted
 * leave revision.
 */
export const REVISION_SESSION_SIZE = 20;
export const UPCOMING_DAYS = 7;

export const REVISION_API_ERRORS = {
  REVISION_ITEM_NOT_FOUND: { status: 404, message: "Review item not found." },
  REVISION_NOT_DUE: { status: 409, message: "This item isn't due yet." },
} as const;
export type RevisionApiErrorCode = keyof typeof REVISION_API_ERRORS;

export const startSessionSchema = z.object({ spaceId: z.uuid("Choose a valid Study Space.").optional() });

export const reviewSchema = z.object({
  requestKey: z.string().min(8).max(100),
  /** Index into the options as sent by the session. */
  selectedIndex: z.number().int().min(0).max(3),
});
export type ReviewRequest = z.infer<typeof reviewSchema>;

export type RevisionListItem = {
  id: string;
  itemId: string;
  spaceId: string;
  spaceName: string;
  topicId: string;
  topicName: string;
  prompt: string;
  dueDate: string;
  intervalDays: number;
  weakTopic: boolean;
};
export type RevisionListResponse = { today: string; overdue: RevisionListItem[]; dueToday: RevisionListItem[]; upcoming: RevisionListItem[] };

export type RevisionSessionItem = { id: string; kind: "mcq"; topicId: string; topicName: string; prompt: string; options: string[] };

export type ReviewResult = {
  outcome: "correct" | "incorrect";
  correctIndex: number;
  explanation: string | null;
  intervalDays: number;
  nextDueDate: string;
};

/** The schedule rule, kept pure so it can be checked at its boundaries. */
export function nextSchedule(streak: number, success: boolean): { streak: number; intervalDays: number } {
  if (!success) return { streak: 0, intervalDays: 1 };
  return { streak: streak + 1, intervalDays: streak === 0 ? 3 : 7 };
}
