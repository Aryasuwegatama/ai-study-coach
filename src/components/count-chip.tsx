import { cn } from "@/lib/class-names";

/** The small grey count next to a heading, for example "Study Spaces 3" (`.count` in the redesign prototype). `suffix` adds a word, for example "6 open". */
export function CountChip({ count, suffix, className }: { count: number; suffix?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-sm leading-normal font-medium tracking-normal text-muted-foreground",
        className,
      )}
    >
      {suffix ? `${count} ${suffix}` : count}
    </span>
  );
}
