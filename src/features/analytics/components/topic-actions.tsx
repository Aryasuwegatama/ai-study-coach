import Link from "next/link";
import { Button } from "@/components/ui/button";
import { canPractise, practiseHref, reviewTopicHref } from "../analytics-format";
import type { MasteryStatus } from "@/features/progress/progress-schemas";

/**
 * "Practise this topic" and "Review mistakes (N)" for one topic, shared by the
 * topic list and the topic page so the two always agree. Practise opens the quiz
 * setup with only this topic ticked; Review mistakes only shows when there are
 * open mistakes.
 */
export function TopicActions({
  spaceId,
  topicId,
  status,
  hasReadyMaterial,
  mistakes,
}: {
  spaceId: string;
  topicId: string;
  status: MasteryStatus;
  hasReadyMaterial: boolean;
  mistakes: number;
}) {
  const practise = canPractise({ status, hasReadyMaterial });
  if (!practise && mistakes === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {practise && (
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={practiseHref(spaceId, topicId)} />}>
          Practise this topic
        </Button>
      )}
      {mistakes > 0 && (
        <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={reviewTopicHref(topicId)} />}>
          Review mistakes ({mistakes})
        </Button>
      )}
    </div>
  );
}
