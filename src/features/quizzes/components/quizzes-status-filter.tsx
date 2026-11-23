"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { SetListItemResponse } from "../quizzes-schemas";

export type QuizzesFilterValue = "all" | "in_progress" | "not_started" | "completed" | "generating" | "failed";

/** Which quizzes each filter shows: the same status a card's pill names. */
export function matchesQuizFilter(quiz: SetListItemResponse, filter: QuizzesFilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "generating":
      return quiz.status === "generating";
    case "failed":
      return quiz.status === "failed";
    case "in_progress":
      return quiz.status === "ready" && quiz.latestAttempt.status === "in_progress";
    case "not_started":
      return quiz.status === "ready" && quiz.latestAttempt.status === "none";
    case "completed":
      return quiz.status === "ready" && quiz.latestAttempt.status === "submitted";
  }
}

const OPTIONS: ReadonlyArray<{ value: QuizzesFilterValue; label: string; always: boolean }> = [
  { value: "all", label: "All", always: true },
  { value: "in_progress", label: "In progress", always: true },
  { value: "not_started", label: "Not started", always: true },
  { value: "completed", label: "Completed", always: true },
  // Only while some quiz is in that state, so the row stays short.
  { value: "generating", label: "Generating", always: false },
  { value: "failed", label: "Generation failed", always: false },
];

/**
 * The single-choice status filter for the Quiz Library, the same pattern as
 * the Materials filter: native radios, visually hidden, drawn as pill chips
 * with their counts. The chosen chip has a check mark and bold text, so it
 * never relies on colour alone; arrow keys move between the options.
 */
export function QuizzesStatusFilter({
  quizzes,
  value,
  onChange,
}: {
  quizzes: SetListItemResponse[];
  value: QuizzesFilterValue;
  onChange: (value: QuizzesFilterValue) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Filter quizzes by status</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const count = quizzes.filter((quiz) => matchesQuizFilter(quiz, option.value)).length;
          if (!option.always && count === 0 && value !== option.value) return null;
          const id = `quizzes-filter-${option.value}`;
          const selected = value === option.value;
          return (
            <span key={option.value} className="relative inline-flex">
              <input
                type="radio"
                id={id}
                name="quizzes-status-filter"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "border-border-strong bg-card font-medium text-muted-foreground hover:bg-surface-hover",
                )}
              >
                {selected && <Check className="size-4" aria-hidden="true" />}
                {option.label} ({count})
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
