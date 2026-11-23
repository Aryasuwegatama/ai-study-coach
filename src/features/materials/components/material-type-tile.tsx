import { cn } from "@/lib/class-names";
import { fileTypeLabel } from "../materials-format";

/** The small tile showing a file's type ("PDF", "PPTX" or "TXT"), used wherever a material is listed. */
export function MaterialTypeTile({ fileName, className }: { fileName: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary",
        className,
      )}
    >
      {fileTypeLabel(fileName)}
    </span>
  );
}
