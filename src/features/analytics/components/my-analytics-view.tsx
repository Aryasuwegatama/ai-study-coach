import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MasteryStatus, SpaceProgress } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_CLASSES, STATUS_LABELS, masteryDetail, pluralise, reviewSpaceHref, spaceAnalyticsHref, topicAnalyticsHref } from "../analytics-format";

const STATUS_ORDER: MasteryStatus[] = ["weak", "insufficient", "not_assessed", "on_track"];
const WEAKEST_SHOWN = 3;

function SpaceCard({ space }: { space: SpaceProgress }) {
  const counts = STATUS_ORDER.map((status) => ({ status, n: space.topics.filter((t) => t.status === status).length })).filter((c) => c.n > 0);
  const weakest = space.topics.filter((t) => t.status === "weak").slice(0, WEAKEST_SHOWN);
  const mistakes = space.topics.reduce((sum, t) => sum + t.mistakes, 0);

  return (
    <Card className="flex w-full flex-col rounded-[20px] p-5">
      <CardContent className="flex flex-1 flex-col gap-4 p-0">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground">{space.spaceName}</h3>

        {space.topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topics yet. Add a material and confirm its topics.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2" aria-label="Topics by status">
              {counts.map(({ status, n }) => (
                <li key={status} className={cn("inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold", STATUS_CLASSES[status])}>
                  {n} {STATUS_LABELS[status]}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Weakest topics</h4>
              {weakest.length === 0 ? (
                <p className="text-sm text-muted-foreground">No weak topics right now.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {weakest.map((topic) => (
                    <li key={topic.topicId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <Link href={topicAnalyticsHref(space.spaceId, topic.topicId)} className="min-w-0 rounded-sm font-medium text-foreground hover:underline">
                        {topic.name}
                      </Link>
                      <span className="text-muted-foreground">{masteryDetail(topic)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-sm text-muted-foreground">{mistakes === 0 ? "No mistakes to review." : `${pluralise(mistakes, "mistake")} to review.`}</p>
          </>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={spaceAnalyticsHref(space.spaceId)} />}>
            View analytics
          </Button>
          {mistakes > 0 && (
            <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={reviewSpaceHref(space.spaceId)} />}>
              Review mistakes ({mistakes})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * My Analytics (Figma 65:43262 populated, 65:43516 empty): one card per Study
 * Space with its topic counts by status, its open mistakes and its weakest
 * topics. Deliberately no overall score and no average across topics, and no
 * trend chart, attempt counts, flashcards card or period selector (no data
 * behind them yet).
 */
export function MyAnalyticsView({ spaces }: { spaces: SpaceProgress[] }) {
  const anyAssessed = spaces.some((s) => s.topics.some((t) => t.counted > 0));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">My Analytics</h1>
        <p className="text-sm text-muted-foreground">How you&apos;re doing in each Study Space, topic by topic.</p>
      </div>

      {spaces.length === 0 ? (
        <Card className="rounded-[20px] p-8">
          <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-soft-purple text-purple">
              <BarChart3 className="size-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">No analytics yet</h2>
              <p className="max-w-sm text-sm text-muted-foreground">Create a Study Space, add a material and take a quiz. Your topic mastery shows up here.</p>
            </div>
            <Button type="button" className="rounded-full" nativeButton={false} render={<Link href="/spaces" />}>
              Go to My Study Spaces
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {!anyAssessed && (
            <Card className="rounded-[20px] p-6">
              <CardContent className="flex flex-col gap-1 p-0">
                <h2 className="text-lg font-semibold text-foreground">No analytics yet</h2>
                <p className="text-sm text-muted-foreground">Take a quiz and your topic mastery shows up here. You need 5 answered questions in a topic to get a score.</p>
              </CardContent>
            </Card>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {spaces.map((space) => (
              <li key={space.spaceId} className="flex">
                <SpaceCard space={space} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
