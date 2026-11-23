"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { DeckListItemResponse } from "../flashcards-schemas";

export type DecksFilterValue = "all" | "paused" | "not_started" | "completed" | "generating" | "failed" | "material_deleted";

/** Which decks each filter shows: the same status a card's pill names. */
export function matchesDeckFilter(deck: DeckListItemResponse, filter: DecksFilterValue): boolean {
  const practisable = deck.status === "ready" && deck.practisableCount > 0;
  switch (filter) {
    case "all":
      return true;
    case "generating":
      return deck.status === "generating";
    case "failed":
      return deck.status === "failed";
    case "material_deleted":
      return deck.status === "ready" && deck.practisableCount === 0;
    case "paused":
      return practisable && deck.latestSession.status === "in_progress";
    case "not_started":
      return practisable && deck.latestSession.status === "none";
    case "completed":
      return practisable && deck.latestSession.status === "completed";
  }
}

const OPTIONS: ReadonlyArray<{ value: DecksFilterValue; label: string; always: boolean }> = [
  { value: "all", label: "All", always: true },
  { value: "paused", label: "Paused practice", always: true },
  { value: "not_started", label: "Not started", always: true },
  { value: "completed", label: "Completed", always: true },
  // Only while some deck is in that state, so the row stays short.
  { value: "generating", label: "Generating", always: false },
  { value: "failed", label: "Generation failed", always: false },
  { value: "material_deleted", label: "Material deleted", always: false },
];

/**
 * The Deck Library's single-choice status filter, the same pattern as the
 * Quizzes and Materials filters: native radios drawn as pill chips with their
 * counts; the chosen chip has a check mark and bold text.
 */
export function DecksStatusFilter({
  decks,
  value,
  onChange,
}: {
  decks: DeckListItemResponse[];
  value: DecksFilterValue;
  onChange: (value: DecksFilterValue) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Filter flashcards by status</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const count = decks.filter((deck) => matchesDeckFilter(deck, option.value)).length;
          if (!option.always && count === 0 && value !== option.value) return null;
          const id = `decks-filter-${option.value}`;
          const selected = value === option.value;
          return (
            <span key={option.value} className="relative inline-flex">
              <input
                type="radio"
                id={id}
                name="decks-status-filter"
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
