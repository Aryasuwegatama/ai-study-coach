"use client";

import { cn } from "@/lib/class-names";
import type { AttemptQuestion } from "../attempts-schemas";

/** The question navigator, 1…N (issue #46). Wraps at phone width (375px
 * acceptance criterion) rather than scrolling sideways. */
export function AttemptQuestionNav({
  questions,
  currentIndex,
  onSelect,
}: {
  questions: AttemptQuestion[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Questions" className="flex flex-wrap gap-2">
      {questions.map((question, index) => {
        const answered = question.selectedIndex !== null;
        const isCurrent = index === currentIndex;
        return (
          <button
            key={question.itemId}
            type="button"
            onClick={() => onSelect(index)}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`Question ${index + 1}${answered ? ", answered" : ", unanswered"}`}
            // Answered is a solid fill and unanswered an outline, so the two
            // differ in shape, not just in a near-identical pale tint; the
            // current question adds a ring on top of its fill.
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isCurrent
                ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                : answered
                  ? "border-green bg-green text-white hover:bg-green/85"
                  : "border-muted-foreground/60 bg-background text-foreground hover:bg-muted",
            )}
          >
            {index + 1}
          </button>
        );
      })}
    </nav>
  );
}
