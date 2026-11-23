import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_LABELS, STATUS_ORDER } from "../analytics-format";

/**
 * Status fills for charts: Weak red, On track green, Not enough evidence muted.
 * Not assessed is a diagonal texture, because the two neutral statuses and
 * the green are hard to tell apart with colour-blindness. Every fill also
 * has its name and count as text.
 */
const FILL: Record<MasteryStatus, string> = {
  weak: "bg-destructive text-destructive-foreground",
  insufficient: "bg-muted-foreground text-primary-foreground",
  not_assessed:
    "bg-[repeating-linear-gradient(135deg,var(--secondary)_0_5px,var(--border-strong)_5px_7px)] text-foreground",
  on_track: "bg-green text-primary-foreground",
};

/**
 * "Topics by status" (`.status-stack` in the redesign prototype): one
 * segmented bar of topic counts in a fixed order, a 2px gap between parts,
 * each count printed in its part, and a legend with every status and its
 * count. Screen readers get the same numbers from the bar's label.
 */
export function AnalyticsStatusBar({ counts, label }: { counts: Record<MasteryStatus, number>; label: string }) {
  const summary = STATUS_ORDER.map((status) => `${counts[status]} ${STATUS_LABELS[status]}`).join(", ");

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${label}: ${summary}`} className="flex h-7 min-w-0 gap-0.5">
        {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
          <span
            key={status}
            style={{ flexGrow: counts[status] }}
            className={cn(
              "flex min-w-8 basis-0 items-center justify-center rounded-sm text-sm leading-none font-semibold tabular-nums",
              FILL[status],
            )}
          >
            {status === "not_assessed" ? <span className="rounded-full bg-card p-1">{counts[status]}</span> : counts[status]}
          </span>
        ))}
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="inline-flex items-center gap-2">
            <span className={cn("size-4 shrink-0 rounded-[0.25rem]", FILL[status])} />
            <span>{STATUS_LABELS[status]}</span>
            <span className="font-semibold tabular-nums">{counts[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bar fill for a topic's own percentage: only Weak and On track topics have one. */
export const PERCENT_FILL: Record<"weak" | "on_track", string> = {
  weak: "bg-destructive",
  on_track: "bg-green",
};
