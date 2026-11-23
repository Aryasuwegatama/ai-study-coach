"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { AttemptQuestion } from "../attempts-schemas";

/**
 * The question navigator, 1…N (issue #46; redesign prototype
 * `quiz-attempt.html`). An answered question shows a check mark; the one
 * being viewed has a thick outline. Wraps at phone width rather than
 * scrolling sideways.
 */
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
    <nav aria-labelledby="question-nav-label" className="flex flex-col gap-2">
      <p id="question-nav-label" className="text-sm font-semibold text-foreground">
        Questions
      </p>
      <ul className="flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const answered = question.selectedIndex !== null;
          const isCurrent = index === currentIndex;
          return (
            <li key={question.itemId}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}${answered ? ", answer selected" : ", not answered yet"}`}
                className={cn(
                  "relative flex size-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  answered ? "border-green bg-soft-green text-green" : "border-input bg-card text-foreground hover:bg-surface-hover",
                  isCurrent && "border-primary shadow-[inset_0_0_0_2px_var(--primary)]",
                )}
              >
                {index + 1}
                {answered && (
                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-green text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">A check mark means an answer is selected. The outlined number is the question you&apos;re viewing.</p>
    </nav>
  );
}
