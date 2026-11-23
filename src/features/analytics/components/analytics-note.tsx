import { Info } from "lucide-react";
import { cn } from "@/lib/class-names";

/** The one-line reminder of what counts towards mastery (`.analytics-note` in the redesign prototype). Shown once per Analytics page. */
export function AnalyticsNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex max-w-[42rem] items-start gap-2 text-sm text-muted-foreground", className)}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>Only submitted quiz answers count towards mastery. Flashcard ratings and reviewing mistakes never change it.</span>
    </p>
  );
}
