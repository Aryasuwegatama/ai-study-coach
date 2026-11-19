"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/class-names";
import type { AttemptQuestionWithTopicName } from "@/features/quizzes/fixtures/quizzes-sample-types";

/**
 * One attempt question (issue #46; Figma node 49:18898, MCQ attempt).
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
  question: AttemptQuestionWithTopicName;
  onSelect: (index: number) => void;
  onAdvance: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-purple px-2.5 text-xs font-semibold text-purple">
        {question.topicName}
      </span>
      <p className="text-lg font-medium text-foreground">{question.prompt}</p>
      {/* `null` (not `undefined`) for an unanswered question keeps the
          group controlled for its whole lifetime: `undefined` would hand
          the selection to Base UI's own state, which then shows the
          previous question's answer. */}
      <RadioGroup value={question.selectedIndex} onValueChange={(value) => onSelect(Number(value))}>
        {question.options.map((option, index) => (
          <label
            key={index}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (question.selectedIndex !== index) onSelect(index);
              else onAdvance();
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm text-foreground",
              question.selectedIndex === index ? "border-primary bg-soft-purple/30" : "border-border hover:bg-muted",
            )}
          >
            <RadioGroupItem value={index} />
            {option}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
