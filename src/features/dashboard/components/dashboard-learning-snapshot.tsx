import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardSummary } from "../server/dashboard-service";

/**
 * "Learning Snapshot" (Figma node 80:6946, "Snapshot · grouped metrics"): four
 * plain numbers from the student's real data. No dates, and deliberately no
 * overall accuracy or average across topics: mastery is only ever per topic.
 */
export function DashboardLearningSnapshot({ summary }: { summary: DashboardSummary }) {
  const metrics = [
    { label: "Active study spaces", value: summary.activeSpaces, hint: "Your Study Spaces", href: null },
    { label: "Quizzes completed", value: summary.quizzesCompleted, hint: "Submitted quizzes", href: null },
    { label: "Weak topics", value: summary.weakTopics, hint: "View My Analytics", href: "/analytics" },
    { label: "Mistakes to review", value: summary.openMistakes, hint: "Open My Plan", href: "/plan" },
  ];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Learning Snapshot</h2>
      <Card className="flex flex-col divide-y divide-border rounded-[20px] p-0 sm:flex-row sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <CardContent key={metric.label} className="flex flex-1 flex-col gap-1 p-6">
            <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
            <span className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">{metric.value}</span>
            {metric.href ? (
              <Link href={metric.href} className="w-fit rounded-sm text-xs font-medium text-primary hover:underline">
                {metric.hint}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">{metric.hint}</span>
            )}
          </CardContent>
        ))}
      </Card>
    </section>
  );
}
