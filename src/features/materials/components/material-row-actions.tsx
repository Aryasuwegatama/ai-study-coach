"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MaterialResponse } from "../materials-schemas";

/**
 * Per-row actions: **Confirm topics** (primary) for a `review_topics` row and
 * **Retry processing** (outline, a direct action with no extra dialog) for a
 * failed row sit outside the menu; **Download file** and **Delete material**
 * sit in the "⋯" menu. For a row still `processing` or `uploading` the delete
 * item reads **Cancel processing & delete** and opens the same delete flow
 * with its own wording. Download is blocked only while `uploading` (contract:
 * "Download... While uploading: 409 INVALID_MATERIAL_STATE").
 */
export function MaterialRowActions({
  spaceId,
  material,
  onRetry,
  onDelete,
  onDownload,
}: {
  spaceId: string;
  material: MaterialResponse;
  onRetry: (id: string) => void;
  onDelete: (material: MaterialResponse) => void;
  onDownload: (material: MaterialResponse) => void;
}) {
  const canDownload = material.status !== "uploading";
  const inProgress = material.status === "uploading" || material.status === "processing";

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      {material.status === "failed" && (
        <Button type="button" variant="outline" onClick={() => onRetry(material.id)}>
          Retry processing
        </Button>
      )}
      {material.status === "review_topics" && (
        <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials/${material.id}/topics`} />}>
          Confirm topics
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${material.originalName}`}
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canDownload} onClick={() => canDownload && onDownload(material)}>
            Download file
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(material)}>
            {inProgress ? "Cancel processing & delete" : "Delete material"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
