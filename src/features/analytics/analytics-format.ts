import { MASTERY_MIN_EVIDENCE, type MasteryStatus, type TopicMastery } from "@/features/progress/progress-schemas";

/**
 * Analytics wording (T-15; PRD Section 2 "Mastery and progress"). The
 * mastery rules live in `progress-schemas.ts`; this only names them for
 * the student. Never an average across topics: every line is about one topic.
 */
export const STATUS_LABELS: Record<MasteryStatus, string> = {
  weak: "Weak",
  on_track: "On track",
  insufficient: "Not enough evidence",
  not_assessed: "Not assessed",
};

/** The fixed status order for counts, legends and charts (the API's "weak first" order). */
export const STATUS_ORDER: MasteryStatus[] = ["weak", "insufficient", "not_assessed", "on_track"];

/** How many topics have each status. Counts only: never an average or an overall score. */
export function countByStatus(topics: ReadonlyArray<{ status: MasteryStatus }>): Record<MasteryStatus, number> {
  const counts: Record<MasteryStatus, number> = { weak: 0, insufficient: 0, not_assessed: 0, on_track: 0 };
  for (const topic of topics) counts[topic.status] += 1;
  return counts;
}

/** Open mistakes across these topics (a count of questions to revisit, not a score). */
export const totalMistakes = (topics: ReadonlyArray<{ mistakes: number }>) => topics.reduce((sum, t) => sum + t.mistakes, 0);

/** Pill tones (`Badge`): red for Weak, green for On track, neutral for the rest. */
export const STATUS_TONES: Record<MasteryStatus, "red" | "green" | "neutral"> = {
  weak: "red",
  on_track: "green",
  insufficient: "neutral",
  not_assessed: "neutral",
};

/** The line under a topic's status: "50% of the latest 8", "3 of 5 needed" or "Not tested yet". */
export function masteryDetail(topic: Pick<TopicMastery, "status" | "percent" | "counted">): string {
  switch (topic.status) {
    case "not_assessed":
      return "Not tested yet";
    case "insufficient":
      return `${topic.counted} of ${MASTERY_MIN_EVIDENCE} needed`;
    default:
      return `${topic.percent}% of the latest ${topic.counted}`;
  }
}

export { pluralise } from "@/lib/pluralise";

/** A moment shown as a date in the student's own time zone, for example "21 Nov 2026". */
export function formatAnsweredDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));
}

export const practiseHref = (spaceId: string, topicId: string) => `/spaces/${spaceId}/quizzes/new?topic=${topicId}`;
export const reviewTopicHref = (topicId: string) => `/plan/review?topicId=${topicId}`;
export const reviewSpaceHref = (spaceId: string) => `/plan/review?spaceId=${spaceId}`;
export const spaceAnalyticsHref = (spaceId: string) => `/spaces/${spaceId}/analytics`;
export const topicAnalyticsHref = (spaceId: string, topicId: string) => `/spaces/${spaceId}/analytics/topics/${topicId}`;

/** Practise shows on Weak, Not enough evidence and Not assessed topics that still have a Ready material. */
export const canPractise = (topic: { status: MasteryStatus; hasReadyMaterial: boolean }) => topic.hasReadyMaterial && topic.status !== "on_track";
