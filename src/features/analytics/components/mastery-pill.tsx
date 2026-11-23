import type { MasteryStatus, TopicMastery } from "@/features/progress/progress-schemas";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_TONES, masteryDetail } from "../analytics-format";

/** A topic's status, in words (never colour alone). */
export function MasteryPill({ status }: { status: MasteryStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** The topic's materials were all deleted: its history stays, but there is nothing to practise from. */
export function NoMaterialPill() {
  return <Badge tone="neutral">No material</Badge>;
}

/** Status pill, "No material" when it applies, and the detail line ("50% of the latest 8", "3 of 5 needed", "Not tested yet"). */
export function TopicStatusLine({
  topic,
  hasReadyMaterial,
}: {
  topic: Pick<TopicMastery, "status" | "percent" | "counted">;
  hasReadyMaterial: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <MasteryPill status={topic.status} />
      {!hasReadyMaterial && <NoMaterialPill />}
      <span className="text-sm text-muted-foreground">{masteryDetail(topic)}</span>
    </div>
  );
}
