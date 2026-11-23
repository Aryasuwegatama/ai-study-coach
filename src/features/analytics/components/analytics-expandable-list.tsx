"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/class-names";

/** Rows shown before "Show all". Matches the `nth-child(n+7)` rule below. */
export const LIST_INITIAL = 6;

/**
 * A list that shows its first 6 rows and a "Show all N topics" button, so a
 * long list doesn't push the rest of the page down. Every row is rendered on
 * the server; collapsing only hides rows 7 onwards with CSS. `ordered` makes
 * it an `<ol>` (Topic detail's counted questions, newest first).
 */
export function AnalyticsExpandableList({
  children,
  total,
  noun,
  ordered = false,
}: {
  children: ReactNode;
  total: number;
  /** Plural, for the button: "topics", "questions". */
  noun: string;
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  return (
    <>
      <List id={id} className={cn(!expanded && "[&>li:nth-child(n+7)]:hidden")}>
        {children}
      </List>
      {total > LIST_INITIAL && (
        <div className="border-t border-border px-6 py-3 max-sm:px-4">
          <Button variant="ghost" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((open) => !open)}>
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            {expanded ? `Show fewer ${noun}` : `Show all ${total} ${noun}`}
          </Button>
        </div>
      )}
    </>
  );
}
