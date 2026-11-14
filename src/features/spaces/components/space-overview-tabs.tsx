import Link from "next/link";
import { cn } from "@/lib/class-names";

type SpaceTabKey = "overview" | "materials";

/**
 * Study Space contextual navigation (Figma node 14:273), shared between
 * Overview and Materials (T-09a plan step 2). Overview and Materials are
 * real links; Quizzes, Flashcards and Progress stay disabled rather than
 * linking to a 404, the same pattern T-04b used for unbuilt sidebar items
 * — each later task (Quizzes: T-12, Flashcards, Progress: T-15) enables
 * its own tab.
 */
const TABS: ReadonlyArray<{ key: SpaceTabKey; label: string } | { key: null; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "materials", label: "Materials" },
  { key: null, label: "Quizzes" },
  { key: null, label: "Flashcards" },
  { key: null, label: "Progress" },
];

export function SpaceOverviewTabs({ spaceId, active }: { spaceId: string; active: SpaceTabKey }) {
  return (
    <div
      role="tablist"
      aria-label="Study space sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {TABS.map((tab) => {
        if (tab.key === null) {
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={false}
              disabled
              aria-disabled="true"
              className="shrink-0 px-3 py-2 text-sm font-medium text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {tab.label}
            </button>
          );
        }

        const isActive = tab.key === active;
        return (
          <Link
            key={tab.label}
            href={`/spaces/${spaceId}/${tab.key}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 px-3 py-2 text-sm font-medium",
              isActive ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
