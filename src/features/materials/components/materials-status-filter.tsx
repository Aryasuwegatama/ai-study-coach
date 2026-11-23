"use client";

import { Check } from "lucide-react";
import type { MaterialResponse } from "../materials-schemas";

export type MaterialsFilterValue = "all" | "topics-ready" | "processing" | "ready";

/** Which materials each filter shows. Processing includes files still uploading; failed files show only under All. */
export function matchesFilter(material: MaterialResponse, filter: MaterialsFilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "topics-ready":
      return material.status === "review_topics";
    case "processing":
      return material.status === "uploading" || material.status === "processing";
    case "ready":
      return material.status === "ready";
  }
}

const OPTIONS: ReadonlyArray<{ value: MaterialsFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "topics-ready", label: "Topics ready" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready" },
];

/**
 * The single-choice status filter (`.material-filters` in the redesign
 * prototype): native radio inputs, visually hidden, with the labels drawn as
 * pill chips. The chosen chip also gets a check mark and bold text, so it
 * never relies on colour alone, and the radio's keyboard focus shows a ring
 * on its chip. Arrow keys move between the options, as for any radio group.
 */
export function MaterialsStatusFilter({
  materials,
  value,
  onChange,
}: {
  materials: MaterialResponse[];
  value: MaterialsFilterValue;
  onChange: (value: MaterialsFilterValue) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Filter by status</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const count = materials.filter((material) => matchesFilter(material, option.value)).length;
          const id = `materials-filter-${option.value}`;
          const selected = value === option.value;
          return (
            <span key={option.value} className="relative inline-flex">
              <input
                type="radio"
                id={id}
                name="materials-status-filter"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 ${
                  selected
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "border-border bg-card font-medium text-muted-foreground hover:bg-surface-hover"
                }`}
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
