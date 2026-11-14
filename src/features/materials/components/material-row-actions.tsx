"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MaterialWithSize } from "../client/materials-client";

/**
 * Per-row actions (issue #25, "Delete has no Figma design"): "Retry
 * processing" for a failed row and a disabled "Review topics" for
 * review_topics sit outside the menu as primary actions; Download and
 * Delete sit in the "⋯" menu, the same split as the Study Space header's.
 * Download is blocked only while `uploading` (contract: "Download...
 * While uploading: 409 INVALID_MATERIAL_STATE").
 */
export function MaterialRowActions({
  material,
  onRetry,
  onDelete,
  onDownload,
}: {
  material: MaterialWithSize;
  onRetry: (id: string) => void;
  onDelete: (material: MaterialWithSize) => void;
  onDownload: (material: MaterialWithSize) => void;
}) {
  const canDownload = material.status !== "uploading";

  return (
    <div className="flex items-center justify-end gap-2">
      {material.status === "failed" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onRetry(material.id)}
        >
          Retry processing
        </Button>
      )}
      {material.status === "review_topics" && (
        <Button type="button" variant="outline" size="sm" className="rounded-full" disabled aria-disabled="true">
          Review topics
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${material.originalName}`}
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canDownload} onClick={() => canDownload && onDownload(material)}>
            Download
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(material)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
