import Link from "next/link";
import { BarChart3, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { PageHead } from "@/components/page-container";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { SpaceMonogram } from "@/features/spaces/components/space-monogram";
import type { MasteryStatus, SpaceProgress } from "@/features/progress/progress-schemas";
import {
  countByStatus,
  masteryDetail,
  pluralise,
  reviewSpaceHref,
  spaceAnalyticsHref,
  topicAnalyticsHref,
  totalMistakes,
} from "../analytics-format";
import { AnalyticsMistakesChart } from "./analytics-mistakes-chart";
import { AnalyticsNote } from "./analytics-note";
import { AnalyticsStatusBar } from "./analytics-status-bar";
import { MasteryPill } from "./mastery-pill";

const WEAKEST_SHOWN = 3;

const RULES: Record<MasteryStatus, string> = {
  weak: "At least 5 questions answered and below 60%.",
  on_track: "At least 5 questions answered and 60% or above.",
  insufficient: "1 to 4 questions answered. No percentage yet.",
  not_assessed: "No quiz answers in this topic yet.",
};
const RULES_ORDER: MasteryStatus[] = ["weak", "on_track", "insufficient", "not_assessed"];

function SpaceCard({ space }: { space: SpaceProgress }) {
  const weakest = space.topics.filter((t) => t.status === "weak").slice(0, WEAKEST_SHOWN);
  const mistakes = totalMistakes(space.topics);
  const label = "text-sm font-semibold text-foreground";

  return (
    <Card className="gap-4 p-6 max-sm:p-4">
      <header className="flex items-start gap-3">
        <SpaceMonogram id={space.spaceId} name={space.spaceName} className="size-12 shrink-0 rounded-lg text-lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title break-words text-foreground">{space.spaceName}</h3>
          <p className="text-sm text-muted-foreground">
            {space.topics.length === 0 ? "No confirmed topics yet" : pluralise(space.topics.length, "confirmed topic")}
          </p>
        </div>
      </header>

      {space.topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">Upload a material and confirm its topics to see them here.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h4 className={label}>Topics by status</h4>
            <AnalyticsStatusBar counts={countByStatus(space.topics)} label={`${space.spaceName} topics by status`} />
          </div>

          <div className="flex flex-col gap-2">
            <h4 className={label}>Weakest topics</h4>
            {weakest.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weak topics right now.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {weakest.map((topic) => (
                  <li key={topic.topicId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <Link
                      href={topicAnalyticsHref(space.spaceId, topic.topicId)}
                      className="min-w-0 font-semibold break-words text-primary underline underline-offset-4 hover:text-primary-hover"
                    >
                      {topic.name}
                    </Link>
                    <span className="text-muted-foreground">{masteryDetail(topic)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-sm">
            <span className="text-muted-foreground">Mistakes to review</span>{" "}
            <span className="font-semibold tabular-nums">{mistakes}</span>
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link href={spaceAnalyticsHref(space.spaceId)} aria-label={`View analytics for ${space.spaceName}`} />}
        >
          View analytics
          <ChevronRight aria-hidden="true" />
        </Button>
        {mistakes > 0 && (
          <Button variant="outline" nativeButton={false} render={<Link href={reviewSpaceHref(space.spaceId)} />}>
            <RotateCcw aria-hidden="true" />
            Review mistakes ({mistakes})
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Analytics (redesign prototype `analytics.html`): one card per Study Space
 * with its topic counts by status, its weakest topics and its open mistakes,
 * plus a comparison of open mistakes per space and the status rules.
 * On wide screens the shorter column stays in view while the other scrolls
 * (`StickyEndColumn`). Deliberately no overall score and no average across topics, and no trend
 * chart, attempt counts, flashcards card or period selector (no data behind
 * them yet).
 */
export function MyAnalyticsView({ spaces }: { spaces: SpaceProgress[] }) {
  const anyAssessed = spaces.some((s) => s.topics.some((t) => t.counted > 0));

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="How you’re doing in each Study Space, topic by topic. Each topic has its own result; topics are never averaged together."
        className="mb-4"
      />
      <AnalyticsNote className="mb-6" />

      {spaces.length === 0 ? (
        <Card className="items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
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
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
          <StickyEndColumn>
            <section aria-labelledby="spaces-heading" className="flex min-w-0 flex-col gap-4">
              <h2 id="spaces-heading" className="flex items-center gap-2 text-section text-foreground">
                Your Study Spaces <CountChip count={spaces.length} />
              </h2>
              {!anyAssessed && (
                <Card className="gap-1 p-6 max-sm:p-4">
                  <h3 className="text-card-title text-foreground">No results yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Take a quiz and your topic mastery shows up here. You need 5 answered questions in a topic to get a
                    percentage.
                  </p>
                </Card>
              )}
              <ul className="flex flex-col gap-4">
                {spaces.map((space) => (
                  <li key={space.spaceId}>
                    <SpaceCard space={space} />
                  </li>
                ))}
              </ul>
            </section>
          </StickyEndColumn>

          <StickyEndColumn>
            <aside aria-label="Across your Study Spaces" className="flex min-w-0 flex-col gap-6">
              <Card className="gap-4 p-6 max-sm:p-4">
                <div>
                  <h2 className="text-card-title text-foreground">Mistakes to review</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open mistakes in each Study Space. This is a count of questions to revisit, not a score.
                  </p>
                </div>
                <AnalyticsMistakesChart
                  spaces={spaces.map((s) => ({ spaceId: s.spaceId, name: s.spaceName, mistakes: totalMistakes(s.topics) }))}
                />
              </Card>
              <Card className="gap-4 p-6 max-sm:p-4">
                <h2 className="text-card-title text-foreground">How mastery works</h2>
                <ul className="flex flex-col gap-4">
                  {RULES_ORDER.map((status) => (
                    <li key={status} className="flex flex-col items-start gap-1">
                      <MasteryPill status={status} />
                      <span className="text-sm text-muted-foreground">{RULES[status]}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">Each topic uses your latest 10 answered questions in that topic.</p>
              </Card>
            </aside>
          </StickyEndColumn>
        </div>
      )}
    </>
  );
}

