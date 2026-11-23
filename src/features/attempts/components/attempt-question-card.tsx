"use client";

import { Check } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/class-names";
import { OPTION_LETTERS, type AttemptQuestion } from "../attempts-schemas";

/**
 * One attempt question (issue #46; redesign prototype `quiz-attempt.html`):
 * the prompt and four lettered options. The picked option has a filled
 * letter, a thicker border and a check mark, so it never relies on colour.
 * No "View source" here (security rule: no sources before submission).
 * Keyboard (PRD Section 2, Accessibility): arrow keys move between
 * options (`RadioGroup`'s own roving focus); Enter on a focused, not-yet
 * -selected option selects it, and Enter on the already-selected one
 * advances to the next question.
 */
export function AttemptQuestionCard({
  question,
  onSelect,
  onAdvance,
}: {
  question: AttemptQuestion;
  onSelect: (index: number) => void;
  onAdvance: () => void;
}) {
  const promptId = `prompt-${question.itemId}`;
  return (
    <div className="flex flex-col gap-4">
      <p id={promptId} className="text-card-title break-words text-foreground">
        {question.prompt}
      </p>
      {/* `null` (not `undefined`) for an unanswered question keeps the
          group controlled for its whole lifetime: `undefined` would hand
          the selection to Base UI's own state, which then shows the
          previous question's answer. */}
      <RadioGroup aria-labelledby={promptId} value={question.selectedIndex} onValueChange={(value) => onSelect(Number(value))}>
        {question.options.map((option, index) => {
          const picked = question.selectedIndex === index;
          return (
            <label
              key={index}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (question.selectedIndex !== index) onSelect(index);
                else onAdvance();
              }}
              className={cn(
                "flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-4 text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                picked ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]" : "border-input bg-card hover:bg-surface-hover",
              )}
            >
              {/* The real radio stays focusable for the keyboard; its ring shows on the whole row. */}
              <span className="sr-only">
                <RadioGroupItem value={index} />
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
                  picked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {OPTION_LETTERS[index]}
              </span>
              <span className="min-w-[12rem] flex-1 break-words">{option}</span>
              {picked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
