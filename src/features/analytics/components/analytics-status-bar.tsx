import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_LABELS, STATUS_ORDER } from "../analytics-format";

/**
 * Status fills for charts: Weak red, On track green, Not enough evidence muted.
 * Not assessed is a diagonal texture, because the two neutral statuses and
 * the green are hard to tell apart with colour-blindness. Every fill also
 * has its name and count as text on the page.
 */
export const STATUS_FILL: Record<MasteryStatus, string> = {
  weak: "bg-destructive text-destructive-foreground",
  insufficient: "bg-muted-foreground text-primary-foreground",
  not_assessed:
    "bg-[repeating-linear-gradient(135deg,var(--secondary)_0_5px,var(--border-strong)_5px_7px)] text-foreground",
  on_track: "bg-green text-primary-foreground",
};

/**
 * A thin bar of topic counts by status in a fixed order, a 2px gap between
 * parts (a Study Space row on Analytics). No numbers or legend: the page's
 * status tiles name the colours, and screen readers get every count from
 * the bar's label.
 */
export function AnalyticsStatusBar({ counts, label }: { counts: Record<MasteryStatus, number>; label: string }) {
  const summary = STATUS_ORDER.map((status) => `${counts[status]} ${STATUS_LABELS[status]}`).join(", ");

  return (
    <span role="img" aria-label={`${label}: ${summary}`} className="flex h-2.5 min-w-0 gap-0.5">
      {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
        <span
          key={status}
          style={{ flexGrow: counts[status] }}
          className={cn("min-w-2 basis-0 rounded-[0.2rem]", STATUS_FILL[status])}
        />
      ))}
    </span>
  );
}

/** Bar fill for a topic's own percentage: only Weak and On track topics have one. */
export const PERCENT_FILL: Record<"weak" | "on_track", string> = {
  weak: "bg-destructive",
  on_track: "bg-green",
};
