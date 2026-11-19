import { Card, CardContent } from "@/components/ui/card";
import type { AttemptResult } from "../attempts-schemas";

/** The per-topic score row (PRD change: "add a per-topic score row"). */
export function ResultsTopicScores({ topics }: { topics: AttemptResult["topics"] }) {
  return (
    <Card className="rounded-[20px] p-6">
      <CardContent className="flex flex-col gap-3 p-0">
        <h3 className="text-sm font-semibold text-foreground">Score by topic</h3>
        <ul className="flex flex-col gap-2">
          {topics.map((topic) => {
            const percent = topic.total === 0 ? 0 : Math.round((topic.correct / topic.total) * 100);
            return (
              <li key={topic.topicId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">{topic.topicName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {topic.correct} of {topic.total} ({percent}%)
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
