import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StickyEndColumn } from "@/components/sticky-end-column";
import type { ActivityResponse, SpaceProgress } from "@/features/progress/progress-schemas";
import { byFocus, countByStatus, reviewSpaceHref, spaceAnalyticsHref, totalMistakes, type AnalyticsView } from "../analytics-format";
import { AnalyticsActivityCard } from "./analytics-activity-card";
import { AnalyticsMethodDialog } from "./analytics-method-dialog";
import { AnalyticsSummaryTiles } from "./analytics-summary-tiles";
import { AnalyticsTopicsCard, type FocusTopic } from "./analytics-topics-card";

/**
 * Study Space Analytics (UI redesign, Arya, 2026-11-23), the same layout as
 * Analytics: status tiles that filter the list, then the space's topics in
 * focus order (each with its own small bar against the 60% mark, so there is
 * no separate per-topic chart) beside Your activity. Every bar is one
 * topic's own percentage, never a space-level score.
 */
export function SpaceAnalyticsView({
  progress,
  view,
  activity,
  timeZone,
}: {
  progress: SpaceProgress;
  view: AnalyticsView;
  activity: ActivityResponse;
  timeZone: string;
}) {
  const baseHref = spaceAnalyticsHref(progress.spaceId);
  const topics: FocusTopic[] = progress.topics.map((t) => ({ ...t, spaceId: progress.spaceId }));
  const shown = (view === "all" ? topics : topics.filter((t) => t.status === view)).sort(byFocus);

  return (
    <section aria-labelledby="analytics-heading" className="mt-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="analytics-heading" className="text-section text-foreground">
            Analytics
          </h2>
          <p className="mt-2 max-w-[42rem] text-muted-foreground">
            How you&apos;re doing in each topic of this space. Each topic has its own result.
          </p>
        </div>
        <AnalyticsMethodDialog />
      </header>

      {progress.topics.length === 0 ? (
        <Card className="items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <h3 className="text-card-title text-foreground">No topics yet</h3>
          <p className="max-w-[42rem] text-muted-foreground">
            Upload a material and confirm its topics. Each topic&apos;s mastery shows here once you take a quiz.
          </p>
          <Button nativeButton={false} render={<Link href={`/spaces/${progress.spaceId}/materials`} />}>
            Go to Materials
          </Button>
        </Card>
      ) : (
        <>
          <AnalyticsSummaryTiles
            counts={countByStatus(topics)}
            mistakes={totalMistakes(topics)}
            view={view}
            baseHref={baseHref}
            reviewHref={reviewSpaceHref(progress.spaceId)}
          />
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
            <StickyEndColumn>
              <AnalyticsTopicsCard
                title="Your topics"
                description="Weak topics first, lowest result first. Open a topic to see the questions counted."
                topics={shown}
                view={view}
                baseHref={baseHref}
                anyAssessed={topics.some((t) => t.counted > 0)}
                headingLevel="h3"
              />
            </StickyEndColumn>
            <StickyEndColumn>
              <AnalyticsActivityCard activity={activity} timeZone={timeZone} scope="space" headingLevel="h3" />
            </StickyEndColumn>
          </div>
        </>
      )}
    </section>
  );
}
