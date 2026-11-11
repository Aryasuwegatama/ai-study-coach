import { Card, CardContent } from "@/components/ui/card";
import { dashboardSampleSnapshot } from "../fixtures/dashboard-sample-snapshot";

/**
 * "Learning Snapshot" card (Figma node 80:6946, "Snapshot · grouped
 * metrics"): four metrics in one card, separated by hairlines. All values
 * come from `dashboard-sample-snapshot.ts` — nothing here is hard-coded
 * sample data.
 */
export function DashboardLearningSnapshot() {
  const snapshot = dashboardSampleSnapshot;
  const metrics = [
    {
      label: "Active study spaces",
      value: String(snapshot.activeSpaces),
      hint: snapshot.activeSpacesHint,
    },
    {
      label: "Final quiz attempts",
      value: String(snapshot.finalQuizAttempts),
      hint: snapshot.finalQuizAttemptsHint,
    },
    {
      label: "Final quiz accuracy",
      value: `${snapshot.finalQuizAccuracyPercent}%`,
      hint: snapshot.finalQuizAccuracyHint,
    },
    {
      label: "Cards due for review",
      value: String(snapshot.cardsDueForReview),
      hint: snapshot.cardsDueForReviewHint,
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Learning Snapshot</h2>
        <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-primary">
          EXAMPLE DATA
        </span>
      </div>
      <Card className="flex-row divide-x divide-border rounded-[20px] p-0">
        {metrics.map((metric) => (
          <CardContent key={metric.label} className="flex flex-1 flex-col gap-1 p-6">
            <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
            <span className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
              {metric.value}
            </span>
            <span className="text-xs text-muted-foreground">{metric.hint}</span>
          </CardContent>
        ))}
      </Card>
    </section>
  );
}
