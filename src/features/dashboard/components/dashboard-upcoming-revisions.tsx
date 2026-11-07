import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardSampleRevisions } from "../fixtures/dashboard-sample-revisions";
import type { DashboardRevisionStatus } from "../fixtures/dashboard-sample-types";

const STATUS_BADGE_CLASSES: Record<DashboardRevisionStatus, string> = {
  overdue: "bg-soft-amber text-amber",
  today: "bg-muted text-muted-foreground",
};

const KIND_LABELS = {
  quiz: "Quiz",
  flashcards: "Flashcards",
} as const;

/**
 * "Upcoming Revisions" list (Figma node 80:6946, "Scheduled reviews").
 * "Review" is disabled — revision sessions don't exist yet (T-14/T-15).
 */
export function DashboardUpcomingRevisions() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Upcoming Revisions</h2>
        <Button type="button" variant="ghost" disabled aria-disabled="true">
          View revision plan
        </Button>
      </div>
      <Card className="gap-0 divide-y divide-border rounded-[20px] p-0">
        {dashboardSampleRevisions.map((item) => (
          <CardContent key={item.id} className="flex items-center gap-4 p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft-amber text-amber">
              <Clock className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-foreground">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.spaceName} · {KIND_LABELS[item.kind]}
              </span>
            </div>
            <span
              className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-semibold ${STATUS_BADGE_CLASSES[item.status]}`}
            >
              {item.dueLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              aria-disabled="true"
              className="shrink-0 rounded-full"
            >
              Review
            </Button>
          </CardContent>
        ))}
      </Card>
    </section>
  );
}
