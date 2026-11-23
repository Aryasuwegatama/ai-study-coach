import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pluralise } from "@/lib/pluralise";
import type { SpaceCounts } from "../spaces-schemas";
import { loadSpaceCounts } from "../server/load-space-counts";
import { SpaceMonogram } from "./space-monogram";
import { SpaceOverviewActions } from "./space-overview-actions";

/**
 * The Study Space banner (`.space-banner` in the redesign prototype), shared
 * by every space page so they all show the same header: the monogram tile
 * (hidden on mobile), "Your Study Space", the name (wraps, never truncated),
 * the counts, and the actions on the right.
 *
 * `actions="overview"` adds **Upload material** and **Create quiz** before the
 * "⋯" menu (Overview only); `"menu-only"` (the default) is the menu alone.
 *
 * It reads its own counts (cached per request with the tabs), so pages only
 * pass the space they already loaded. Call it after `requireSpace()`.
 */
export async function SpaceHeader({
  spaceId,
  name,
  actions = "menu-only",
}: {
  spaceId: string;
  name: string;
  actions?: "overview" | "menu-only";
}) {
  return <SpaceBanner spaceId={spaceId} name={name} counts={await loadSpaceCounts(spaceId)} actions={actions} />;
}

/** The banner itself, with the counts passed in (no data reads here). */
export function SpaceBanner({
  spaceId,
  name,
  counts,
  actions = "menu-only",
}: {
  spaceId: string;
  name: string;
  counts: Pick<SpaceCounts, "materialCount" | "confirmedTopicCount">;
  actions?: "overview" | "menu-only";
}) {
  return (
    <section
      aria-labelledby="space-title"
      className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-[linear-gradient(110deg,var(--hero-start),var(--hero-end))] p-6 shadow-card max-sm:p-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <SpaceMonogram id={spaceId} name={name} className="hidden size-14 rounded-lg text-xl sm:flex" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Your Study Space</p>
          <h1 id="space-title" className="text-page-mobile break-words text-foreground sm:text-page">
            {name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pluralise(counts.materialCount, "material")} · {pluralise(counts.confirmedTopicCount, "confirmed topic")} ·
            Private to you
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
        {actions === "overview" && (
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials?upload=1`} />}>
              Upload material
            </Button>
            <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
              Create quiz
            </Button>
          </>
        )}
        <SpaceOverviewActions spaceId={spaceId} name={name} />
      </div>
    </section>
  );
}
