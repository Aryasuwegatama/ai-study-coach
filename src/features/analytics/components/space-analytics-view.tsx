import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SpaceProgress, TopicProgress } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { masteryDetail, reviewSpaceHref, spaceAnalyticsHref, topicAnalyticsHref } from "../analytics-format";
import { MasteryPill, NoMaterialPill } from "./mastery-pill";
import { TopicActions } from "./topic-actions";

export type AnalyticsView = "all" | "weak";

function TopicCard({ spaceId, topic }: { spaceId: string; topic: TopicProgress }) {
  return (
    <Card className="rounded-[20px] p-5">
      <CardContent className="flex flex-col gap-3 p-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="min-w-0 text-base font-semibold text-foreground">
            <Link href={topicAnalyticsHref(spaceId, topic.topicId)} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {topic.name}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <MasteryPill status={topic.status} />
            {!topic.hasReadyMaterial && <NoMaterialPill />}
            <span className="text-sm text-muted-foreground">{masteryDetail(topic)}</span>
          </div>
        </div>
        <TopicActions spaceId={spaceId} topicId={topic.topicId} status={topic.status} hasReadyMaterial={topic.hasReadyMaterial} mistakes={topic.mistakes} />
      </CardContent>
    </Card>
  );
}

function ViewToggle({ spaceId, view }: { spaceId: string; view: AnalyticsView }) {
  const base = "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium";
  return (
    <nav aria-label="Topic filter" className="flex flex-wrap gap-2">
      <Link
        href={spaceAnalyticsHref(spaceId)}
        aria-current={view === "all" ? "page" : undefined}
        className={cn(base, view === "all" ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        All topics
      </Link>
      <Link
        href={`${spaceAnalyticsHref(spaceId)}?view=weak`}
        aria-current={view === "weak" ? "page" : undefined}
        className={cn(base, view === "weak" ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        View weak topics
      </Link>
    </nav>
  );
}

/**
 * Study Space Analytics (Figma 65:43673 and 65:44105): the space's confirmed
 * topics, weak first (the API's order), each with its status and the actions
 * that follow from it. No quiz history or provisional practice (no data yet).
 */
export function SpaceAnalyticsView({ progress, view }: { progress: SpaceProgress; view: AnalyticsView }) {
  const topics = view === "weak" ? progress.topics.filter((t) => t.status === "weak") : progress.topics;
  const mistakes = progress.topics.reduce((sum, t) => sum + t.mistakes, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Topic mastery</h2>
        {mistakes > 0 && (
          <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={reviewSpaceHref(progress.spaceId)} />}>
            Review mistakes ({mistakes})
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Mastery is the share of your latest 10 answered questions in each topic that you got right.</p>

      {progress.topics.length === 0 ? (
        <Card className="rounded-[20px] p-8">
          <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-soft-purple text-purple">
              <BarChart3 className="size-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">No topics yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">Add a material and confirm its topics. Your mastery for each topic shows here once you take quizzes.</p>
            </div>
            <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${progress.spaceId}/materials`} />}>
              Go to Materials
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ViewToggle spaceId={progress.spaceId} view={view} />
          {topics.length === 0 ? (
            <Card className="rounded-[20px] p-8">
              <CardContent className="flex flex-col gap-1 p-0 text-center">
                <h3 className="text-lg font-semibold text-foreground">No weak topics</h3>
                <p className="text-sm text-muted-foreground">None of your topics is below 60% right now.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {topics.map((topic) => (
                <li key={topic.topicId}>
                  <TopicCard spaceId={progress.spaceId} topic={topic} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
