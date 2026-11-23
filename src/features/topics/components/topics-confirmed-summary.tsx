import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TopicResponse } from "../topics-schemas";

/**
 * The post-confirm state, shown in the page where the editor was (T-09c;
 * Figma node 47:18966, restyled in the UI redesign, Step 5). Lists the
 * topics from the confirm response; a linked topic shows the existing
 * confirmed topic's name. Confirming is not learning evidence, so no mastery
 * score appears here.
 */
export function TopicsConfirmedSummary({
  spaceId,
  materialsHref,
  topics,
}: {
  spaceId: string;
  materialsHref: string;
  topics: TopicResponse[];
}) {
  const sorted = [...topics].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card role="region" aria-labelledby="topics-confirmed-title" className="mt-8 gap-5 p-6 max-sm:p-4">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-soft-green text-green">
          <Check className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="topics-confirmed-title" className="text-section text-foreground">
            Topics confirmed
          </h2>
          <p className="mt-1 text-muted-foreground">
            Your selected topics are now available for future quizzes and flashcards. Confirming topics is not
            learning evidence, so no mastery score is shown.
          </p>
        </div>
        <Badge tone="green" className="shrink-0 max-sm:hidden">
          Material ready
        </Badge>
      </div>
      <ul className="overflow-hidden rounded-lg border border-border">
        {sorted.map((topic) => (
          <li
            key={topic.id}
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <span className="min-w-0 font-semibold break-words text-foreground">{topic.name}</span>
            <Badge tone="green" className="shrink-0">
              Confirmed
            </Badge>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/overview`} />}>
          Go to Overview
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={materialsHref} />}>
          Return to Materials
        </Button>
      </div>
    </Card>
  );
}
