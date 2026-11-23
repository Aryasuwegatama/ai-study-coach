import type { PlanItemResponse, SuggestionPlan } from "./plan-schemas";

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
