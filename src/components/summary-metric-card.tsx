import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/class-names";

const TILE_TONES = {
  blue: "bg-accent text-primary",
  green: "bg-soft-green text-green",
  amber: "bg-soft-amber text-amber",
  purple: "bg-soft-purple text-purple",
} as const;

export type MetricTone = keyof typeof TILE_TONES;

/**
 * A summary number card (`.metric` and `.overview-metric` in the redesign
 * prototype). Two layouts:
 * - `row` (Dashboard): a tinted icon tile on the left, the number and its label beside it.
 * - `stacked` (Space Overview): the label with a small icon on top, the number under it, then the detail.
 *
 * With `href` the whole `row` card is a link. `children` is an optional
 * detail line (the Overview uses it for breakdowns and links). A number is
 * always a count, never an average or an overall score.
 */
export function SummaryMetricCard({
  icon: Icon,
  tone = "blue",
  value,
  label,
  href,
  layout = "row",
  children,
}: {
  icon: LucideIcon;
  tone?: MetricTone;
  value: number;
  label: string;
  href?: string;
  layout?: "row" | "stacked";
  children?: React.ReactNode;
}) {
  if (layout === "stacked") {
    return (
      <Card className="gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <p className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </Card>
    );
  }

  const body = (
    <>
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg", TILE_TONES[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {children}
      </div>
    </>
  );

  if (href) {
    return (
      <Card className="p-0">
        <Link
          href={href}
          className="flex items-center gap-4 rounded-xl px-6 py-5 outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:px-4"
        >
          {body}
        </Link>
      </Card>
    );
  }
  return <Card className="flex-row items-center gap-4 px-6 py-5 max-sm:px-4">{body}</Card>;
}
