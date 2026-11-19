import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { STATUS_CLASSES, STATUS_LABELS } from "../analytics-format";

const PILL = "inline-flex h-7 w-fit shrink-0 items-center rounded-full px-3 text-xs font-semibold";

/** A topic's status, in words (never colour alone). */
export function MasteryPill({ status }: { status: MasteryStatus }) {
  return <span className={cn(PILL, STATUS_CLASSES[status])}>{STATUS_LABELS[status]}</span>;
}

/** The topic's materials were all deleted: its history stays, but there is nothing to practise from. */
export function NoMaterialPill() {
  return <span className={cn(PILL, "bg-muted text-muted-foreground")}>No material</span>;
}
