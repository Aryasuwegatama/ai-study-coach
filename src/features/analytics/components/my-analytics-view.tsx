import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { PageHead } from "@/components/page-container";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { SpaceMonogram } from "@/features/spaces/components/space-monogram";
import type { ActivityResponse, SpaceProgress } from "@/features/progress/progress-schemas";
import { byFocus, countByStatus, pluralise, spaceAnalyticsHref, totalMistakes, type AnalyticsView } from "../analytics-format";
import { AnalyticsActivityCard } from "./analytics-activity-card";
import { AnalyticsMethodDialog } from "./analytics-method-dialog";
import { AnalyticsStatusBar } from "./analytics-status-bar";
import { AnalyticsSummaryTiles } from "./analytics-summary-tiles";
import { AnalyticsTopicsCard, type FocusTopic } from "./analytics-topics-card";

/** One Study Space as a compact row: its status bar, weak and mistake counts, and a link to its own Analytics. */
function SpaceRow({ space }: { space: SpaceProgress }) {
  const counts = countByStatus(space.topics);
  const mistakes = totalMistakes(space.topics);

  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={spaceAnalyticsHref(space.spaceId)}
        className="grid grid-cols-1 items-center gap-x-6 gap-y-3 px-6 py-4 outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset max-sm:px-4 md:grid-cols-[minmax(12rem,1.3fr)_minmax(8rem,1fr)_minmax(9rem,auto)_auto]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <SpaceMonogram id={space.spaceId} name={space.spaceName} className="size-10 shrink-0 rounded-lg" />
          <span className="min-w-0">
            <span className="sr-only">View analytics for </span>
            <span className="block font-semibold break-words text-foreground">{space.spaceName}</span>
            <span className="block text-sm text-muted-foreground">
              {space.topics.length === 0 ? "No confirmed topics yet" : pluralise(space.topics.length, "confirmed topic")}
            </span>
          </span>
        </span>
        {space.topics.length > 0 ? <AnalyticsStatusBar counts={counts} label="Topics by status" /> : <span />}
        <span className="text-sm text-muted-foreground tabular-nums md:text-right">
          <span className="font-semibold text-foreground">{counts.weak}</span> weak ·{" "}
          <span className="font-semibold text-foreground">{mistakes}</span> {mistakes === 1 ? "mistake" : "mistakes"} to review
        </span>
        <ChevronRight className="size-5 text-muted-foreground max-md:hidden" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Analytics, across every Study Space (UI redesign, Arya, 2026-11-23),
 * ordered by what a student asks first:
 * 1. where do I stand: topic counts by status and open mistakes, as tiles
 *    that also filter the list;
 * 2. what next: "Focus next", every topic in focus order (weak, lowest
 *    first) with its own result and actions, first 6 then "Show all";
 * 3. am I keeping up: Your activity, beside it;
 * then one compact row per Study Space. The status rules sit in a dialog
 * ("How is this worked out?").
 * Deliberately no overall score, no average across topics and no period
 * selector.
 */
export function MyAnalyticsView({
  spaces,
  activity,
  timeZone,
  view,
}: {
  spaces: SpaceProgress[];
  activity: ActivityResponse;
  timeZone: string;
  view: AnalyticsView;
}) {
  const topics: FocusTopic[] = spaces.flatMap((s) => s.topics.map((t) => ({ ...t, spaceId: s.spaceId, spaceName: s.spaceName })));
  const shown = (view === "all" ? topics : topics.filter((t) => t.status === view)).sort(byFocus);

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="How you’re doing in each Study Space, topic by topic. Each topic has its own result; topics are never averaged together."
      >
        <AnalyticsMethodDialog />
      </PageHead>

      {spaces.length === 0 ? (
        <Card className="items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-card-title text-foreground">No topics to show yet</h2>
          <p className="max-w-[42rem] text-muted-foreground">
            Create a Study Space, upload a material and confirm its topics. After your first quiz, each topic shows how
            you&apos;re doing.
          </p>
          <Button nativeButton={false} render={<Link href="/spaces" />}>
            Go to Study Spaces
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <AnalyticsSummaryTiles
            counts={countByStatus(topics)}
            mistakes={totalMistakes(topics)}
            view={view}
            baseHref="/analytics"
            reviewHref="/plan/review"
          />

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
            <StickyEndColumn>
              <section aria-labelledby="topics-heading">
                <AnalyticsTopicsCard
                  title="Focus next"
                  description="Weak topics first, lowest result first, then topics that need more answers."
                  topics={shown}
                  view={view}
                  baseHref="/analytics"
                  anyAssessed={topics.some((t) => t.counted > 0)}
                  headingLevel="h2"
                />
              </section>
            </StickyEndColumn>
            <StickyEndColumn>
              <AnalyticsActivityCard activity={activity} timeZone={timeZone} scope="all" />
            </StickyEndColumn>
          </div>

          <section aria-labelledby="spaces-heading" className="flex flex-col gap-4">
            <h2 id="spaces-heading" className="flex items-center gap-2 text-section text-foreground">
              By Study Space <CountChip count={spaces.length} />
            </h2>
            <Card className="gap-0 p-0">
              <ul>
                {spaces.map((space) => (
                  <SpaceRow key={space.spaceId} space={space} />
                ))}
              </ul>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
