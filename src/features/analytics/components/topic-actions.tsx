import Link from "next/link";
import { ListChecks, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/class-names";
import { canPractise, practiseHref, reviewTopicHref } from "../analytics-format";
import type { MasteryStatus } from "@/features/progress/progress-schemas";

/**
 * "Practise this topic" and "Review mistakes (N)" for one topic, shared by the
 * topic list and the topic page so the two always agree. Practise opens the quiz
 * setup with only this topic ticked; Review mistakes only shows when there are
 * open mistakes.
 *
 * `emphasis="page"` (the topic page) makes Practise the primary action;
 * `"row"` (a list row) uses quieter outline and ghost buttons.
 */
export function TopicActions({
  spaceId,
  topicId,
  status,
  hasReadyMaterial,
  mistakes,
  emphasis = "row",
  className,
}: {
  spaceId: string;
  topicId: string;
  status: MasteryStatus;
  hasReadyMaterial: boolean;
  mistakes: number;
  emphasis?: "row" | "page";
  className?: string;
}) {
  const practise = canPractise({ status, hasReadyMaterial });
  if (!practise && mistakes === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {practise && (
        <Button
          variant={emphasis === "page" ? "default" : "outline"}
          nativeButton={false}
          render={<Link href={practiseHref(spaceId, topicId)} />}
        >
          <ListChecks aria-hidden="true" />
          Practise this topic
        </Button>
      )}
      {mistakes > 0 && (
        <Button
          variant={emphasis === "page" ? "outline" : "ghost"}
          nativeButton={false}
          render={<Link href={reviewTopicHref(topicId)} />}
        >
          <RotateCcw aria-hidden="true" />
          Review mistakes ({mistakes})
        </Button>
      )}
    </div>
  );
}
