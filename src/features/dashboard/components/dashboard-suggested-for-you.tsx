import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Suggestion } from "@/features/plan/server";

/**
 * "Suggested for you" (replaces Figma node 80:6946's "Upcoming Revisions"
 * after lecturer feedback on 13 November 2026): the top suggestions from the
 * student's analytics, each with its action. Advice only: nothing is
 * scheduled. The full list, and the student's own plan, is My Plan.
 */
export function DashboardSuggestedForYou({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground">Suggested for you</h2>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/plan" />}>
          Open My Plan
        </Button>
      </div>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suggestions yet. Take a quiz to get some.</p>
      ) : (
        <Card className="gap-0 divide-y divide-border rounded-[20px] p-0">
          {suggestions.map((suggestion) => (
            <CardContent key={suggestion.key} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4">
              <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-soft-purple text-purple sm:flex">
                <Lightbulb className="size-5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{suggestion.detail}</span>
                <span className="text-xs text-muted-foreground">{suggestion.spaceName}</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="w-fit shrink-0 rounded-full" nativeButton={false} render={<Link href={suggestion.href} />}>
                {suggestion.actionLabel}
              </Button>
            </CardContent>
          ))}
        </Card>
      )}
    </section>
  );
}
