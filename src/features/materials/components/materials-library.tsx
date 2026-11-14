"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MATERIAL_API_ERRORS, MAX_MATERIALS_PER_SPACE } from "../materials-schemas";
import { fileTypeLabel, formatMaterialSize } from "../materials-format";
import type { MaterialWithSize } from "../client/materials-client";
import { MaterialRowActions } from "./material-row-actions";
import { MaterialStatusBadge } from "./material-status-badge";
import { MaterialsEmptyState } from "./materials-empty-state";

/**
 * The Materials Library (issue #25, plan step 5; Figma nodes 47:18192
 * empty and 47:18353 populated). The table becomes stacked cards at
 * phone width — two renders of the same rows rather than one that
 * reshapes itself, which keeps each layout's markup simple.
 */
export function MaterialsLibrary({
  materials,
  loading,
  onUpload,
  onRetry,
  onDelete,
  onDownload,
}: {
  materials: MaterialWithSize[];
  loading: boolean;
  onUpload: () => void;
  onRetry: (id: string) => void;
  onDelete: (material: MaterialWithSize) => void;
  onDownload: (material: MaterialWithSize) => void;
}) {
  const atLimit = materials.length >= MAX_MATERIALS_PER_SPACE;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">Materials · {materials.length}</h2>
            <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-primary">
              EXAMPLE DATA
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Private to this space · PDF, PPTX or TXT · Maximum 10 MB per file
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            className="shrink-0 gap-2 rounded-full"
            onClick={onUpload}
            disabled={atLimit}
            aria-disabled={atLimit}
          >
            <Plus className="size-4" aria-hidden="true" />
            Upload material
          </Button>
          {atLimit && (
            <p className="max-w-[240px] text-right text-xs text-muted-foreground">
              {MATERIAL_API_ERRORS.MATERIAL_LIMIT_REACHED.message}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <MaterialsLibrarySkeleton />
      ) : materials.length === 0 ? (
        <MaterialsEmptyState onUpload={onUpload} disabled={atLimit} />
      ) : (
        <>
          <Card className="hidden overflow-hidden rounded-[20px] p-0 sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className="max-w-[320px] truncate font-medium text-foreground">
                      {material.originalName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fileTypeLabel(material.originalName)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMaterialSize(material.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <MaterialStatusBadge material={material} />
                    </TableCell>
                    <TableCell>
                      <MaterialRowActions
                        material={material}
                        onRetry={onRetry}
                        onDelete={onDelete}
                        onDownload={onDownload}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-3 sm:hidden">
            {materials.map((material) => (
              <Card key={material.id} className="rounded-[16px] p-4">
                <CardContent className="flex flex-col gap-3 p-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">{material.originalName}</span>
                    <MaterialRowActions
                      material={material}
                      onRetry={onRetry}
                      onDelete={onDelete}
                      onDownload={onDownload}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {fileTypeLabel(material.originalName)} · {formatMaterialSize(material.sizeBytes)}
                  </span>
                  <MaterialStatusBadge material={material} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Example data: these materials are illustrative, and the upload above runs a simulated progress —
        nothing is sent to a server yet.
      </p>
    </section>
  );
}

function MaterialsLibrarySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-16 w-full rounded-[16px]" />
      ))}
    </div>
  );
}
