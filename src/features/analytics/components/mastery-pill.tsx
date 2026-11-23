import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_TONES } from "../analytics-format";

/** A topic's status, in words (never colour alone). */
export function MasteryPill({ status }: { status: MasteryStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** The topic's materials were all deleted: its history stays, but there is nothing to practise from. */
export function NoMaterialPill() {
  return <Badge tone="neutral">No material</Badge>;
}
