import { Badge } from "@/components/ui/badge";
import type { MaterialResponse, MaterialStatus } from "../materials-schemas";

/**
 * Status labels (PRD Section 2 "Materials") and their `Badge` tones. The
 * `review_topics` status is shown to students as "Topics ready".
 */
const STATUS_LABELS: Record<MaterialStatus, string> = {
  uploading: "Uploading",
  processing: "Processing",
  review_topics: "Topics ready",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_TONES: Record<MaterialStatus, "neutral" | "blue" | "amber" | "green" | "red"> = {
  uploading: "neutral",
  processing: "blue",
  review_topics: "amber",
  ready: "green",
  failed: "red",
};

export function MaterialStatusBadge({ material }: { material: MaterialResponse }) {
  const progressSuffix =
    material.status === "processing" && material.progress
      ? ` · ${material.progress.done} of ${material.progress.total} sections`
      : "";

  return (
    <div className="flex flex-col gap-1">
      <Badge tone={STATUS_TONES[material.status]}>
        {STATUS_LABELS[material.status]}
        {progressSuffix}
      </Badge>
      {material.status === "failed" && material.error && (
        <span className="text-xs text-muted-foreground">{material.error.message}</span>
      )}
    </div>
  );
}
