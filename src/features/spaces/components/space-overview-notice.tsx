import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { MaterialResponse } from "@/features/materials/materials-schemas";

const NAMES_SHOWN = 3;

/**
 * The amber "topics ready" notice at the top of Overview: shown only while
 * some material has topic suggestions waiting. **Confirm topics** goes to the
 * first (newest) of them; the others are on the Materials page.
 */
export function SpaceOverviewNotice({ spaceId, materials }: { spaceId: string; materials: MaterialResponse[] }) {
  const ready = materials.filter((material) => material.status === "review_topics");
  const first = ready[0];
  if (!first) return null;

  const names = ready.slice(0, NAMES_SHOWN).map((material) => material.originalName);
  const more = ready.length - names.length;
  const title = ready.length === 1 ? "1 material has topics ready" : `${ready.length} materials have topics ready`;

  return (
    <Alert
      variant="warning"
      role="region"
      aria-labelledby="topics-ready-title"
      className="flex flex-wrap items-center gap-4"
    >
      <div className="min-w-[16rem] flex-1">
        <h2 id="topics-ready-title" className="font-semibold">
          {title}
        </h2>
        <p className="text-sm break-words">
          {names.join(", ")}
          {more > 0 ? ` and ${more} more` : ""} · Confirm the suggestions to use them in future quizzes and flashcards.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials/${first.id}/topics`} />}>
        Confirm topics
      </Button>
    </Alert>
  );
}
