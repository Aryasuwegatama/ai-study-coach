import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { MASTERY_MIN_EVIDENCE, type MasteryStatus, type TopicMastery, type TopicProgress } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_LABELS, analyticsViewHref, masteryDetail, topicAnalyticsHref, type AnalyticsView } from "../analytics-format";
import { PERCENT_FILL } from "./analytics-status-bar";
import { AnalyticsExpandableList } from "./analytics-expandable-list";
import { MasteryPill, NoMaterialPill } from "./mastery-pill";
import { TopicActions } from "./topic-actions";

/** A topic row's data: its progress, its space, and (on the all-spaces page) the space's name. */
export type FocusTopic = TopicProgress & { spaceId: string; spaceName?: string };

const EMPTY: Record<MasteryStatus, string> = {
  weak: "No weak topics right now.",
  insufficient: "No topics are waiting for more answers.",
  not_assessed: "Every topic has at least one quiz answer.",
  on_track: "No topics are on track yet. A topic is on track at 60% or above, with at least 5 answers.",
};

/**
 * The topic's own result as a small picture beside its words (hidden from
 * screen readers, which get the words): a bar with a 60% mark for Weak and
 * On track, a 5-step meter for Not enough evidence, nothing for Not
 * assessed (never a 0% bar).
 */
export function TopicMeter({
  topic,
  className = "w-24 sm:w-32",
}: {
  topic: Pick<TopicMastery, "status" | "percent" | "counted">;
  /** The bar's width (Topic detail stretches it). */
  className?: string;
}) {
  if ((topic.status === "weak" || topic.status === "on_track") && topic.percent !== null) {
    return (
      <span aria-hidden="true" className={cn("relative h-2 shrink-0 rounded-full bg-border", className)}>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", PERCENT_FILL[topic.status])} style={{ width: `${topic.percent}%` }} />
        <span className="absolute -inset-y-1 left-[60%] w-0.5 -translate-x-1/2 rounded-full bg-foreground/70" />
      </span>
    );
  }
  if (topic.status === "insufficient") {
    return (
      <span aria-hidden="true" className="flex shrink-0 gap-0.5">
        {Array.from({ length: MASTERY_MIN_EVIDENCE }, (_, i) => (
          <span key={i} className={cn("h-2 w-4 rounded-[0.2rem]", i < topic.counted ? "bg-muted-foreground" : "bg-border")} />
        ))}
      </span>
    );
  }
  return null;
}

function TopicRow({ topic, heading: Heading }: { topic: FocusTopic; heading: "h3" | "h4" }) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border px-6 py-4 max-sm:px-4">
      <div className="min-w-[14rem] flex-1">
        <Heading className="font-semibold break-words">
          <Link
            href={topicAnalyticsHref(topic.spaceId, topic.topicId)}
            className="text-primary underline underline-offset-4 hover:text-primary-hover"
          >
            {topic.name}
          </Link>
        </Heading>
        {topic.spaceName && <p className="text-sm break-words text-muted-foreground">{topic.spaceName}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <MasteryPill status={topic.status} />
          {!topic.hasReadyMaterial && <NoMaterialPill />}
          <TopicMeter topic={topic} />
          <span className="text-sm text-muted-foreground">{masteryDetail(topic)}</span>
        </div>
        {!topic.hasReadyMaterial && (
          <p className="mt-1 text-sm text-muted-foreground">No ready material to practise from. Past answers still count.</p>
        )}
      </div>
      <TopicActions
        spaceId={topic.spaceId}
        topicId={topic.topicId}
        status={topic.status}
        hasReadyMaterial={topic.hasReadyMaterial}
        mistakes={topic.mistakes}
        className="max-sm:w-full"
      />
    </li>
  );
}

/**
 * The topic list on both Analytics pages ("Focus next" across every space,
 * "Your topics" in one space): already filtered by the status tiles and in
 * focus order, first 6 rows then "Show all". Each row is one topic's own
 * result and its next actions; nothing is averaged.
 */
export function AnalyticsTopicsCard({
  title,
  description,
  topics,
  view,
  baseHref,
  anyAssessed,
  headingLevel,
}: {
  /** The heading when every topic shows; a filtered list is named after its status. */
  title: string;
  description: string;
  topics: FocusTopic[];
  view: AnalyticsView;
  baseHref: string;
  anyAssessed: boolean;
  headingLevel: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const filtered = view !== "all";

  return (
    <Card className="gap-0 p-0">
      <header className="flex flex-col gap-1 p-6 max-sm:p-4">
        <Heading id="topics-heading" className="flex items-center gap-2 text-card-title text-foreground">
          {filtered ? `${STATUS_LABELS[view]} topics` : title} <CountChip count={topics.length} />
        </Heading>
        <p className="text-sm text-muted-foreground">
          {filtered ? (
            <>
              Only topics that are {STATUS_LABELS[view]}.{" "}
              <Link
                href={analyticsViewHref(baseHref, "all")}
                scroll={false}
                className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
              >
                Show every topic
              </Link>
            </>
          ) : (
            description
          )}
        </p>
        {!anyAssessed && (
          <p className="mt-3 rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">
            Take a quiz and your results show here. A topic needs 5 answered questions before it gets a percentage.
          </p>
        )}
      </header>
      {topics.length === 0 ? (
        <p className="border-t border-border px-6 py-8 text-center text-muted-foreground max-sm:px-4">
          {filtered ? EMPTY[view] : "No confirmed topics yet. Upload a material and confirm its topics to see them here."}
        </p>
      ) : (
        <AnalyticsExpandableList key={view} total={topics.length} noun="topics">
          {topics.map((topic) => (
            <TopicRow key={topic.topicId} topic={topic} heading={headingLevel === "h2" ? "h3" : "h4"} />
          ))}
        </AnalyticsExpandableList>
      )}
    </Card>
  );
}
