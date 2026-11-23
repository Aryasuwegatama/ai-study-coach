import { Card } from "@/components/ui/card";
import type { AttemptResult } from "../attempts-schemas";

/** "Score by topic" for this attempt (PRD change: "add a per-topic score row"). Not topic mastery. */
export function ResultsTopicScores({ topics }: { topics: AttemptResult["topics"] }) {
  return (
    <Card className="gap-3 p-6 max-sm:p-4">
      <h3 className="text-card-title text-foreground">Score by topic</h3>
      <ul className="flex flex-col">
        {topics.map((topic) => {
          const percent = topic.total === 0 ? 0 : Math.round((topic.correct / topic.total) * 100);
          return (
            <li key={topic.topicId} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-border py-2 first:border-t-0">
              <span className="min-w-0 break-words text-foreground">{topic.topicName}</span>
              <span className="shrink-0">
                <span className="font-semibold tabular-nums text-foreground">
                  {topic.correct} of {topic.total}
                </span>{" "}
                <span className="text-sm text-muted-foreground">({percent}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">These scores describe this attempt, not your overall topic mastery.</p>
    </Card>
  );
}
