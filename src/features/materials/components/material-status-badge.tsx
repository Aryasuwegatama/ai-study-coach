import { Badge } from "@/components/ui/badge";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { MATERIAL_FAILURE_REASONS, type MaterialResponse, type MaterialStatus } from "../materials-schemas";

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

/** The one-line explanation under the badge in the Materials table. Uploading needs none: the badge says it. */
const STATUS_EXPLANATIONS: Partial<Record<MaterialStatus, string>> = {
  processing: "Extracting content. You can continue studying.",
  review_topics: "Topic suggestions are ready to confirm.",
  ready: "Available for quizzes and flashcards.",
};

/**
 * A material's status as a pill. With `detailed` (the Materials table) it also
 * shows the one-line explanation, a labelled progress bar while processing,
 * and the real failure reason for a failed file.
 */
export function MaterialStatusBadge({ material, detailed = false }: { material: MaterialResponse; detailed?: boolean }) {
  const progress = material.status === "processing" ? material.progress : null;
  const progressSuffix = progress
    ? detailed
      ? ` · ${progress.done} of ${progress.total}`
      : ` · ${progress.done} of ${progress.total} sections`
    : "";
  const failureMessage = material.status === "failed" ? (material.error?.message ?? MATERIAL_FAILURE_REASONS.PROCESSING_FAILED) : null;

  return (
    <div className="flex flex-col gap-1">
      <Badge tone={STATUS_TONES[material.status]}>
        {STATUS_LABELS[material.status]}
        {progressSuffix}
      </Badge>
      {detailed && (STATUS_EXPLANATIONS[material.status] || failureMessage) && (
        <p className="text-sm text-muted-foreground">{failureMessage ?? STATUS_EXPLANATIONS[material.status]}</p>
      )}
      {detailed && progress && (
        <LabelledProgressBar
          value={progress.done}
          max={progress.total}
          label={`${progress.done} of ${progress.total} sections processed`}
        />
      )}
      {!detailed && failureMessage && material.error && (
        <span className="text-sm text-muted-foreground">{material.error.message}</span>
      )}
    </div>
  );
}
