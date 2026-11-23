import type { PlanItemResponse, PlanStage, SuggestionKind, SuggestionPlan } from "./plan-schemas";

/**
 * A day the student picked, shown as a plain date: "Mon 23 Nov" (with the
 * year when it isn't this year). Never "today" or "late": the app
 * doesn't compare it with anything. `day` is a calendar date, so it is
 * formatted in UTC and can't shift with the time zone.
 */
export function formatPlannedOn(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const sameYear = date.getUTCFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

/** True when an open plan item already has this suggestion's kind and target (the server's rule, kept in step locally). */
export function isInPlan(plan: SuggestionPlan, items: PlanItemResponse[]): boolean {
  const target = plan.topicId ?? plan.setId ?? plan.materialId;
  return items.some((item) => item.doneAt === null && item.kind === plan.kind && (item.topicId ?? item.setId ?? item.materialId) === target);
}

/** Short labels above each suggestion so the ranked list is quick to scan (UI redesign). The sentence itself is unchanged. */
export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  weak_topic: "Weak topic",
  mistakes: "Mistakes to review",
  not_enough_evidence: "Not enough evidence",
  unfinished_quiz: "Unfinished quiz",
  unfinished_deck: "Unfinished flashcards",
  not_tested: "Not tested yet",
  topic_review: "Topics ready",
};

/** Plan board columns, in order. */
export const PLAN_STAGE_LABELS: Record<PlanStage, string> = { todo: "To do", doing: "Doing", done: "Done" };

/** Items split by board column, keeping the server's order (open by planned day then Anytime; done newest first). */
export function itemsByStage(items: PlanItemResponse[]): Record<PlanStage, PlanItemResponse[]> {
  return {
    todo: items.filter((item) => item.stage === "todo"),
    doing: items.filter((item) => item.stage === "doing"),
    done: items.filter((item) => item.stage === "done"),
  };
}
