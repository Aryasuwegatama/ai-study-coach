import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reviewSpaceHref } from "@/features/analytics/analytics-format";
import { pluralise } from "@/lib/pluralise";

/**
 * Overview's "Revisit your mistakes" card (`.plan-prompt` in the redesign
 * prototype): shown only when this space has open mistakes. Reviewing
 * mistakes never changes mastery, and the card says so.
 */
export function SpaceOverviewMistakes({ spaceId, mistakes }: { spaceId: string; mistakes: number }) {
  if (mistakes <= 0) return null;

  return (
    <Card role="region" aria-labelledby="mistakes-title" className="gap-2 border-border bg-[linear-gradient(110deg,var(--hero-start),var(--hero-end))] p-6 max-sm:p-4">
      <h2 id="mistakes-title" className="font-semibold text-foreground">
        Revisit your mistakes
      </h2>
      <p className="text-sm text-muted-foreground">
        Practise your {pluralise(mistakes, "incorrect answer")} again. This practice won&apos;t change mastery.
      </p>
      <Button variant="ghost" className="mt-2 w-fit" nativeButton={false} render={<Link href={reviewSpaceHref(spaceId)} />}>
        Review mistakes
      </Button>
    </Card>
  );
}
