"use client";

import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "../plan-schemas";

/**
 * One suggestion: the sentence built from the student's analytics, its Study
 * Space, the action it leads to, and "Add to my plan" (or "In my plan" once
 * added). Advice only: nothing here is mandatory and nothing has a date.
 */
export function SuggestionRow({
  suggestion,
  inPlan,
  busy,
  onAdd,
}: {
  suggestion: Suggestion;
  inPlan: boolean;
  busy: boolean;
  onAdd: (suggestion: Suggestion) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{suggestion.detail}</p>
        <p className="text-xs text-muted-foreground">{suggestion.spaceName}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={suggestion.href} />}>
          {suggestion.actionLabel}
        </Button>
        {inPlan ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-soft-green px-3 text-sm font-medium text-green">
            <Check className="size-4" aria-hidden="true" />
            In my plan
          </span>
        ) : (
          <Button type="button" variant="outline" className="gap-1.5 rounded-full" disabled={busy} onClick={() => onAdd(suggestion)}>
            <Plus className="size-4" aria-hidden="true" />
            Add to my plan
          </Button>
        )}
      </div>
    </div>
  );
}
