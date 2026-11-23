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
 * A summary number card (`.metric` in the redesign prototype): a tinted icon
 * tile, a large number and its label. With `href` the whole card is a link;
 * `children` is an optional detail line under the label (the Overview page
 * uses it for breakdowns). A number is always about counts, never an
 * average or an overall score.
 */
export function SummaryMetricCard({
  icon: Icon,
  tone = "blue",
  value,
  label,
  href,
  children,
}: {
  icon: LucideIcon;
  tone?: MetricTone;
  value: number;
  label: string;
  href?: string;
  children?: React.ReactNode;
}) {
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
