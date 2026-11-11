import { cn } from "@/lib/class-names";

/**
 * Study Space contextual navigation (Figma node 14:273). Only Overview
 * exists; the rest are shown disabled rather than linking to a 404, the
 * same pattern T-04b used for unbuilt sidebar items — each later task
 * (Materials: T-09, Quizzes: T-12, Flashcards, Progress: T-15) enables
 * its own tab.
 */
const TABS = [
  { label: "Overview", disabled: false },
  { label: "Materials", disabled: true },
  { label: "Quizzes", disabled: true },
  { label: "Flashcards", disabled: true },
  { label: "Progress", disabled: true },
] as const;

export function SpaceOverviewTabs() {
  return (
    <div
      role="tablist"
      aria-label="Study space sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {TABS.map((tab) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={!tab.disabled}
          disabled={tab.disabled}
          aria-disabled={tab.disabled}
          className={cn(
            "shrink-0 px-3 py-2 text-sm font-medium",
            !tab.disabled
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
