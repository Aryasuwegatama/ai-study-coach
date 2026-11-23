import Link from "next/link";
import { BarChart3, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import type { SpaceProgress, TopicProgress } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { countByStatus, pluralise, reviewSpaceHref, spaceAnalyticsHref, topicAnalyticsHref, totalMistakes } from "../analytics-format";
import { AnalyticsMasteryChart } from "./analytics-mastery-chart";
import { AnalyticsNote } from "./analytics-note";
import { AnalyticsStatusBar } from "./analytics-status-bar";
import { TopicStatusLine } from "./mastery-pill";
import { TopicActions } from "./topic-actions";

export type AnalyticsView = "all" | "weak";

function TopicRow({ spaceId, topic }: { spaceId: string; topic: TopicProgress }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-border px-6 py-4 max-sm:px-4">
      <div className="min-w-[12rem] flex-1">
        <h4 className="font-semibold break-words">
          <Link href={topicAnalyticsHref(spaceId, topic.topicId)} className="text-primary underline underline-offset-4 hover:text-primary-hover">
            {topic.name}
          </Link>
        </h4>
        <div className="mt-1">
          <TopicStatusLine topic={topic} hasReadyMaterial={topic.hasReadyMaterial} />
        </div>
        {!topic.hasReadyMaterial && (
          <p className="mt-1 text-sm text-muted-foreground">
            It has no ready material, so there&apos;s nothing to practise from. Past answers still count.
          </p>
        )}
      </div>
      <TopicActions
        spaceId={spaceId}
        topicId={topic.topicId}
        status={topic.status}
        hasReadyMaterial={topic.hasReadyMaterial}
        mistakes={topic.mistakes}
        className="self-center sm:justify-end max-sm:w-full"
      />
    </li>
  );
}

/**
 * The All / Weak filter (`.material-filters` chips in the redesign prototype).
 * It stays in the URL (`?view=weak`) so the server renders the right list; the
 * chosen chip has a check mark and bold text, not colour alone.
 */
function ViewFilter({ spaceId, view, total, weak }: { spaceId: string; view: AnalyticsView; total: number; weak: number }) {
  const options = [
    { value: "all" as const, label: `All (${total})`, href: spaceAnalyticsHref(spaceId) },
    { value: "weak" as const, label: `Weak (${weak})`, href: `${spaceAnalyticsHref(spaceId)}?view=weak` },
  ];
  return (
    <nav aria-labelledby="topic-view-label" className="flex flex-col gap-2">
      <p id="topic-view-label" className="text-sm font-semibold text-muted-foreground">
        View weak topics
      </p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = view === option.value;
          return (
            <li key={option.value}>
              <Link
                href={option.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "border-border-strong bg-card font-medium text-muted-foreground hover:bg-surface-hover",
                )}
              >
                {selected && <Check className="size-4" aria-hidden="true" />}
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Study Space Analytics (redesign prototype `space-analytics.html`): the
 * space's topic counts by status, a per-topic mastery chart, and the topic
 * list, weak first (the API's order), each with its status and the actions
 * that follow from it. Charts show counts or one topic's own percentage,
 * never a space-level score.
 */
export function SpaceAnalyticsView({ progress, view }: { progress: SpaceProgress; view: AnalyticsView }) {
  const counts = countByStatus(progress.topics);
  const topics = view === "weak" ? progress.topics.filter((t) => t.status === "weak") : progress.topics;
  const mistakes = totalMistakes(progress.topics);

  return (
    <section aria-labelledby="analytics-heading" className="mt-6 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 id="analytics-heading" className="text-section text-foreground">
          Analytics
        </h2>
        <p className="max-w-[42rem] text-muted-foreground">
          How you&apos;re doing in each topic of this space. A topic&apos;s mastery is the share of its latest 10 answered
          questions you got right.
        </p>
        <AnalyticsNote className="mt-2" />
      </header>

      {progress.topics.length === 0 ? (
        <Card className="items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
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
          <Card className="gap-4 p-6 max-sm:p-4">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 id="status-summary-heading" className="text-card-title text-foreground">
                  Topics by status
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pluralise(progress.topics.length, "confirmed topic")} · counts, not a score
                </p>
              </div>
              {mistakes > 0 && (
                <Button variant="outline" nativeButton={false} render={<Link href={reviewSpaceHref(progress.spaceId)} />}>
                  <RotateCcw aria-hidden="true" />
                  Review mistakes ({mistakes})
                </Button>
              )}
            </header>
            <AnalyticsStatusBar counts={counts} label={`${progress.spaceName} topics by status`} />
          </Card>

          <Card className="gap-4 p-6 max-sm:p-4">
            <div>
              <h3 id="mastery-chart-heading" className="text-card-title text-foreground">
                Mastery by topic
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                One bar per topic that has a percentage, weak first. A topic needs 5 answered questions before it gets a bar.
              </p>
            </div>
            <AnalyticsMasteryChart topics={progress.topics} />
          </Card>

          <Card className="gap-0 p-0">
            <header className="flex flex-wrap items-start justify-between gap-4 p-6 max-sm:p-4">
              <div>
                <h3 id="topics-heading" className="flex items-center gap-2 text-card-title text-foreground">
                  Your topics <CountChip count={progress.topics.length} />
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">Weak first. Open a topic to see the questions counted.</p>
              </div>
              <ViewFilter spaceId={progress.spaceId} view={view} total={progress.topics.length} weak={counts.weak} />
            </header>
            {topics.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-10 text-center">
                <h4 className="text-card-title text-foreground">No weak topics</h4>
                <p className="text-muted-foreground">None of your topics with a percentage is below 60% right now.</p>
              </div>
            ) : (
              <ul>
                {topics.map((topic) => (
                  <TopicRow key={topic.topicId} spaceId={progress.spaceId} topic={topic} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
