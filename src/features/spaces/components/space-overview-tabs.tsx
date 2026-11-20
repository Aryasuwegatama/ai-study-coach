import Link from "next/link";
import { cn } from "@/lib/class-names";

type SpaceTabKey = "overview" | "materials" | "quizzes" | "flashcards" | "analytics";

/**
 * Study Space contextual navigation (Figma node 14:273), shared between
 * Overview and Materials (T-09a plan step 2). Overview, Materials, Quizzes
 * (T-12a), Flashcards (T-18) and Analytics (T-15; the old "Progress" tab,
 * renamed after lecturer feedback) are real links.
 */
const TABS: ReadonlyArray<{ key: SpaceTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "materials", label: "Materials" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Flashcards" },
  { key: "analytics", label: "Analytics" },
];

export function SpaceOverviewTabs({ spaceId, active }: { spaceId: string; active: SpaceTabKey }) {
  return (
    <div
      role="tablist"
      aria-label="Study space sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {TABS.map((tab) => {
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
