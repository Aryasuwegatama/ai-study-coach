import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Suggestion } from "@/features/plan/server";

/**
 * "Suggested for you" (replaces Figma node 80:6946's "Upcoming Revisions"
 * after lecturer feedback on 13 November 2026), restyled as the prototype's
 * "Make the plan yours" card: the top suggestions from the student's
 * analytics, each with its action. Advice only: nothing is scheduled. The
 * full list, and the student's own plan, is My Plan.
 */
export function DashboardSuggestedForYou({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <Card role="region" aria-labelledby="suggested-title" className="gap-0 border-primary bg-accent p-0">
      <div className="p-6 max-[420px]:p-4">
        <h2 id="suggested-title" className="text-card-title text-foreground">
          Suggested for you
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          My Plan brings together suggestions and your own study choices. You decide what fits.
        </p>
      </div>
      {suggestions.length === 0 ? (
        <p className="px-6 pb-2 text-sm text-muted-foreground max-[420px]:px-4">
          No suggestions yet. Take a quiz to get some.
        </p>
      ) : (
        <ul className="mx-6 flex flex-col divide-y divide-border rounded-lg border border-border bg-card max-[420px]:mx-4">
          {suggestions.map((suggestion) => (
            <li key={suggestion.key} className="flex flex-col items-start gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold break-words text-foreground">{suggestion.detail}</span>
                <span className="text-sm break-words text-muted-foreground">{suggestion.spaceName}</span>
              </div>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={suggestion.href} />}>
                {suggestion.actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="p-6 pt-4 max-[420px]:p-4">
        <Button variant="ghost" nativeButton={false} render={<Link href="/plan" />}>
          Open My Plan
        </Button>
      </div>
    </Card>
  );
}
