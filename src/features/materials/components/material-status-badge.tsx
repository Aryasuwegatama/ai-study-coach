import type { MaterialStatus } from "../materials-schemas";
import type { MaterialWithSize } from "../client/materials-client";

/**
 * Status labels and the status-token colours from `globals.css` (issue
 * #25, "Status labels"). `failed` has no listed token pair, so it reuses
 * the destructive tint the rest of the app already uses for errors
 * (`src/components/ui/button.tsx`'s `destructive` variant).
 */
const STATUS_LABELS: Record<MaterialStatus, string> = {
  uploading: "Uploading",
  processing: "Processing",
  review_topics: "Review needed",
  ready: "Ready",
  failed: "Processing failed",
};

const STATUS_BADGE_CLASSES: Record<MaterialStatus, string> = {
  uploading: "bg-muted text-muted-foreground",
  processing: "bg-soft-amber text-amber",
  review_topics: "bg-soft-purple text-purple",
  ready: "bg-soft-green text-green",
  failed: "bg-destructive/10 text-destructive",
};

export function MaterialStatusBadge({ material }: { material: MaterialWithSize }) {
  const progressSuffix =
    material.status === "processing" && material.progress
      ? ` · ${material.progress.done} of ${material.progress.total} sections`
      : "";

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex h-7 w-fit shrink-0 items-center rounded-full px-3 text-xs font-semibold ${STATUS_BADGE_CLASSES[material.status]}`}
      >
        {STATUS_LABELS[material.status]}
        {progressSuffix}
      </span>
      {material.status === "failed" && material.error && (
        <span className="text-xs text-muted-foreground">{material.error.message}</span>
      )}
    </div>
  );
}
