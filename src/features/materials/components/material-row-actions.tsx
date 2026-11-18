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
 * Per-row actions (issue #25, "Delete has no Figma design"): "Retry
 * processing" for a failed row and "Review topics" for review_topics
 * (T-09c: now a real link to the review page, not disabled) sit outside
 * the menu as primary actions; Download and Delete sit in the "⋯" menu,
 * the same split as the Study Space header's. Download is blocked only
 * while `uploading` (contract: "Download... While uploading: 409
 * INVALID_MATERIAL_STATE").
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          nativeButton={false}
          render={<Link href={`/spaces/${spaceId}/materials/${material.id}/topics`} />}
        >
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
