import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_LABELS, STATUS_ORDER, analyticsViewHref, type AnalyticsView } from "../analytics-format";
import { STATUS_FILL } from "./analytics-status-bar";

const TILE =
  "flex h-full flex-col justify-between gap-3 rounded-xl border p-4 shadow-card outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";
const NUMBER = "text-[1.75rem] leading-none font-semibold tabular-nums text-foreground";

/**
 * The summary strip at the top of both Analytics pages: how many topics have
 * each status (counts, never a score) and the open mistakes. The four status
 * tiles also filter the topic list below (`?view=`); the chosen one has a
 * border and a check mark, not colour alone, and choosing it again shows
 * every topic. The mistakes tile opens Review mistakes.
 */
export function AnalyticsSummaryTiles({
  counts,
  mistakes,
  view,
  baseHref,
  reviewHref,
}: {
  counts: Record<MasteryStatus, number>;
  mistakes: number;
  view: AnalyticsView;
  /** The page itself, so a tile can add or clear `?view=`. */
  baseHref: string;
  reviewHref: string;
}) {
  const mistakesBody = (
    <>
      <span className="text-sm font-medium text-muted-foreground">Mistakes to review</span>
      <span className="flex items-end justify-between gap-2">
        <span className={NUMBER}>{mistakes}</span>
        {mistakes > 0 && (
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary">
            Review
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </span>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
      <nav aria-label="Filter topics by status">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_ORDER.map((status) => {
            const selected = view === status;
            return (
              <li key={status}>
                <Link
                  href={analyticsViewHref(baseHref, selected ? "all" : status)}
                  scroll={false}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    TILE,
                    "bg-card hover:bg-surface-hover",
                    selected ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                >
                  <span className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
                    <span aria-hidden="true" className={cn("mt-1 size-3 shrink-0 rounded-[0.2rem]", STATUS_FILL[status])} />
                    <span className="min-w-0 flex-1">{STATUS_LABELS[status]}</span>
                    {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  </span>
                  <span className={NUMBER}>
                    {counts[status]}
                    <span className="sr-only">
                      {counts[status] === 1 ? " topic" : " topics"}
                      {selected ? ". Showing only these; select again to show every topic." : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {mistakes > 0 ? (
        <Link
          href={reviewHref}
          className={cn(TILE, "border-border bg-[linear-gradient(110deg,var(--hero-start),var(--hero-end))] hover:brightness-[0.98]")}
        >
          {mistakesBody}
        </Link>
      ) : (
        <div className={cn(TILE, "border-border bg-card")}>{mistakesBody}</div>
      )}
    </div>
  );
}
