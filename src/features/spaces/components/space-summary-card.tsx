import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pluralise } from "@/lib/pluralise";
import type { SpaceSummary } from "../spaces-schemas";
import { SpaceMonogram } from "./space-monogram";

/**
 * One Study Space as a card (`.space-card` in the redesign prototype),
 * shared by the Dashboard and Study Spaces. Counts only: a badge appears
 * when its count is above 0, and nothing here is an average or an overall
 * mastery number.
 */
export function SpaceSummaryCard({
  space,
  headingLevel = "h2",
}: {
  space: SpaceSummary;
  /** `h2` on Study Spaces; `h3` on the Dashboard, where the list sits under an h2. */
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <Card className="justify-between gap-4 p-6 max-[420px]:p-4">
      <div className="flex items-start gap-2">
        <SpaceMonogram id={space.id} name={space.name} className="size-12 rounded-lg text-lg" />
        <div className="min-w-0 flex-1 pl-1">
          <Heading className="text-card-title break-words text-foreground">{space.name}</Heading>
          <p className="text-sm text-muted-foreground">
            {pluralise(space.confirmedTopicCount, "confirmed topic")} · {pluralise(space.materialCount, "material")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 max-[420px]:items-start">
        <div className="flex flex-wrap gap-2">
          {space.weakTopicCount > 0 && <Badge tone="red">{pluralise(space.weakTopicCount, "weak topic")}</Badge>}
          {space.topicsReadyCount > 0 && <Badge tone="amber">Topics ready</Badge>}
          {space.quizzesInProgress > 0 && (
            <Badge tone="blue">{pluralise(space.quizzesInProgress, "quiz", "quizzes")} in progress</Badge>
          )}
        </div>
        <Button
          variant="outline"
          className="shrink-0 max-[420px]:w-full"
          nativeButton={false}
          render={<Link href={`/spaces/${space.id}/overview`} aria-label={`Open ${space.name} study space`} />}
        >
          Open space
        </Button>
      </div>
    </Card>
  );
}
