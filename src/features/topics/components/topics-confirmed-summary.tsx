import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TopicResponse } from "../topics-schemas";

/**
 * The post-confirm state (T-09c; Figma node 47:18966, "Topics confirmed,
 * material Ready"). Lists the topics from the confirm response — a
 * linked topic shows the existing confirmed topic's name.
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
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col gap-5 p-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Topics confirmed</h2>
          <p className="text-sm text-muted-foreground">
            Confirming topics is not learning evidence. No mastery score is shown.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {sorted.map((topic) => (
            <li
              key={topic.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{topic.name}</span>
              <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-green px-2.5 text-xs font-semibold text-green">
                Confirmed
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="rounded-full"
            nativeButton={false}
            render={<Link href={`/spaces/${spaceId}/overview`} />}
          >
            Go to Overview
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            nativeButton={false}
            render={<Link href={materialsHref} />}
          >
            Return to Materials
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
