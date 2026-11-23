import Link from "next/link";
import { CountChip } from "@/components/count-chip";
import { cn } from "@/lib/class-names";
import { loadSpaceCounts } from "../server/load-space-counts";

type SpaceTabKey = "overview" | "materials" | "quizzes" | "flashcards" | "analytics";

/**
 * Study Space section navigation (`.section-tabs` in the redesign
 * prototype), shared by every space page. These are page links, not ARIA
 * tabs: a `<nav>` of links with `aria-current="page"` on the active one. The
 * tabs wrap on narrow screens instead of scrolling sideways, and the active
 * underline sits inside the tab. The Materials tab shows a count chip while
 * any material has topics ready to confirm.
 */
const TABS: ReadonlyArray<{ key: SpaceTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "materials", label: "Materials" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Flashcards" },
  { key: "analytics", label: "Analytics" },
];

export async function SpaceOverviewTabs({ spaceId, active }: { spaceId: string; active: SpaceTabKey }) {
  const { topicsReadyCount } = await loadSpaceCounts(spaceId);
  return <SpaceTabs spaceId={spaceId} active={active} topicsReadyCount={topicsReadyCount} />;
}

/** The tab links themselves, with the count passed in (no data reads here). */
export function SpaceTabs({
  spaceId,
  active,
  topicsReadyCount,
}: {
  spaceId: string;
  active: SpaceTabKey;
  topicsReadyCount: number;
}) {
  return (
    <nav aria-label="Study space sections" className="mt-4 flex flex-wrap items-stretch gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/spaces/${spaceId}/${tab.key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm whitespace-nowrap outline-none hover:bg-surface-hover hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:px-3",
              isActive
                ? "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-sm after:bg-primary"
                : "font-medium text-muted-foreground",
            )}
          >
            {tab.label}
            {tab.key === "materials" && topicsReadyCount > 0 && (
              <>
                <CountChip count={topicsReadyCount} />
                <span className="sr-only">with topics ready</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
