"use client";

import Link from "next/link";
import { BarChart3, Check, CircleHelp, FileText, Layers, ListChecks, Plus, RotateCcw, Target, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/class-names";
import type { Suggestion, SuggestionKind } from "../plan-schemas";
import { SUGGESTION_KIND_LABELS } from "../plan-format";

const KIND_ICON: Record<SuggestionKind, { Icon: LucideIcon; tone: string }> = {
  weak_topic: { Icon: Target, tone: "bg-soft-red text-destructive" },
  mistakes: { Icon: RotateCcw, tone: "bg-soft-amber text-amber" },
  not_enough_evidence: { Icon: BarChart3, tone: "bg-accent text-primary" },
  unfinished_quiz: { Icon: ListChecks, tone: "bg-accent text-primary" },
  unfinished_deck: { Icon: Layers, tone: "bg-soft-purple text-purple" },
  not_tested: { Icon: CircleHelp, tone: "bg-accent text-primary" },
  topic_review: { Icon: FileText, tone: "bg-soft-amber text-amber" },
};

/**
 * One suggestion (`.plan-suggestion` in the redesign prototype): a kind label,
 * the sentence built from the student's analytics, its Study Space, then the
 * action it leads to and "Add to my plan" (or "In my plan" once added). Advice
 * only: nothing here is mandatory and nothing has a date.
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
  const { Icon, tone } = KIND_ICON[suggestion.kind];
  const textId = `suggestion-${suggestion.key}`;
  return (
    <Card className="flex-row flex-wrap items-start gap-x-4 gap-y-3 p-4 sm:px-6">
      <span className={cn("hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex", tone)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-muted-foreground">{SUGGESTION_KIND_LABELS[suggestion.kind]}</p>
        <p id={textId} className="font-semibold break-words text-foreground">
          {suggestion.detail}
        </p>
        <p className="text-sm text-muted-foreground">{suggestion.spaceName}</p>
      </div>
      <div className="flex basis-full flex-wrap items-center gap-2 sm:pl-14">
        <Button variant="outline" nativeButton={false} render={<Link href={suggestion.href} aria-describedby={textId} />}>
          {suggestion.actionLabel}
        </Button>
        {inPlan ? (
          <Badge tone="green">
            <Check aria-hidden="true" />
            In my plan
          </Badge>
        ) : (
          <Button type="button" variant="ghost" disabled={busy} aria-describedby={textId} onClick={() => onAdd(suggestion)}>
            <Plus aria-hidden="true" />
            Add to my plan
          </Button>
        )}
      </div>
    </Card>
  );
}
