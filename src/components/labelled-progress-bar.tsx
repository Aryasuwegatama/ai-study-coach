import { cn } from "@/lib/class-names";

/**
 * A thin progress bar with an accessible label (the prototype's `progress`
 * element): the label is read by screen readers, and the caller shows the
 * same words as visible text next to it, for example "4 of 10 questions answered".
 */
export function LabelledProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full border border-border bg-secondary", className)}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}
