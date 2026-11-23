import { CircleAlert, FolderOpen, ListChecks, RotateCcw } from "lucide-react";
import { SummaryMetricCard } from "@/components/summary-metric-card";
import type { DashboardSummary } from "../server/dashboard-service";

/**
 * The four summary numbers (PRD Section 2 "Dashboard"), drawn as metric cards.
 * Counts only: no dates, and deliberately no overall accuracy or average
 * across topics, because mastery is only ever per topic.
 */
export function DashboardLearningSnapshot({ summary }: { summary: DashboardSummary }) {
  return (
    <section
      aria-label="Across your Study Spaces"
      className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <SummaryMetricCard icon={FolderOpen} tone="blue" value={summary.activeSpaces} label="Active study spaces" />
      <SummaryMetricCard icon={ListChecks} tone="green" value={summary.quizzesCompleted} label="Quizzes completed" />
      <SummaryMetricCard
        icon={CircleAlert}
        tone="amber"
        value={summary.weakTopics}
        label="Weak topics"
        href="/analytics"
      />
      <SummaryMetricCard
        icon={RotateCcw}
        tone="purple"
        value={summary.openMistakes}
        label="Mistakes to review"
        href="/plan"
      />
    </section>
  );
}
