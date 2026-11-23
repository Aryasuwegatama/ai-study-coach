import Link from "next/link";
import { BookOpen, CircleAlert, FileText, RotateCcw } from "lucide-react";
import { SummaryMetricCard } from "@/components/summary-metric-card";
import { pluralise } from "@/lib/pluralise";
import type { MaterialResponse } from "@/features/materials/materials-schemas";
import type { TopicProgress } from "@/features/progress/server";
import type { SetListItemResponse } from "@/features/quizzes/server";
import { reviewSpaceHref } from "@/features/analytics/analytics-format";

/** Only the parts above zero, in order, joined with " · ". */
function joinParts(parts: [number, string][]): string {
  return parts
    .filter(([count]) => count > 0)
    .map(([count, text]) => `${count} ${text}`)
    .join(" · ");
}

/**
 * Overview's four summary cards (`.overview-metrics` in the redesign
 * prototype). Counts only: there is never an average or an overall mastery
 * number. Practice resources count only sets a student can open, so failed
 * and still-generating sets are left out.
 */
export function SpaceOverviewMetrics({
  spaceId,
  materials,
  topics,
  sets,
}: {
  spaceId: string;
  materials: MaterialResponse[];
  topics: TopicProgress[];
  sets: SetListItemResponse[];
}) {
  const count = (status: MaterialResponse["status"][]) => materials.filter((m) => status.includes(m.status)).length;
  const materialBreakdown = joinParts([
    [count(["ready"]), "ready"],
    [count(["review_topics"]), "to confirm"],
    [count(["uploading", "processing"]), "processing"],
    [count(["failed"]), "failed"],
  ]);

  const topicCount = (status: TopicProgress["status"]) => topics.filter((t) => t.status === status).length;
  const topicBreakdown = joinParts([
    [topicCount("weak"), "weak"],
    [topicCount("insufficient"), "not enough evidence"],
    [topicCount("not_assessed"), "not assessed"],
  ]);

  const mistakes = topics.reduce((sum, topic) => sum + topic.mistakes, 0);

  const openable = sets.filter((set) => set.status === "ready");
  const quizzes = openable.filter((set) => set.kind === "quiz").length;
  const decks = openable.filter((set) => set.kind === "deck").length;

  return (
    <section aria-label="Study space summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryMetricCard layout="stacked" icon={FileText} value={materials.length} label="Study materials">
        {materialBreakdown || "No materials yet"}
      </SummaryMetricCard>
      <SummaryMetricCard layout="stacked" icon={CircleAlert} value={topics.length} label="Confirmed topics">
        {topics.length === 0
          ? "No confirmed topics yet"
          : topicBreakdown || "No weak topics"}
      </SummaryMetricCard>
      <SummaryMetricCard layout="stacked" icon={RotateCcw} value={mistakes} label="Mistakes to review">
        {mistakes > 0 ? (
          <Link
            href={reviewSpaceHref(spaceId)}
            className="font-semibold text-primary underline underline-offset-4"
          >
            Review mistakes
          </Link>
        ) : (
          "No mistakes to review"
        )}
      </SummaryMetricCard>
      <SummaryMetricCard layout="stacked" icon={BookOpen} value={quizzes + decks} label="Practice resources">
        {pluralise(quizzes, "quiz", "quizzes")} · {pluralise(decks, "flashcard deck")}
      </SummaryMetricCard>
    </section>
  );
}
