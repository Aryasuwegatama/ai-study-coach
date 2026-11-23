"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MATERIAL_API_ERRORS,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS_PER_SPACE,
  type MaterialResponse,
} from "../materials-schemas";
import { fileTypeLabel, formatMaterialSize } from "../materials-format";
import { MaterialRowActions } from "./material-row-actions";
import { MaterialStatusBadge } from "./material-status-badge";
import { MaterialTypeTile } from "./material-type-tile";
import { MaterialsEmptyState } from "./materials-empty-state";
import { MaterialsStatusFilter, matchesFilter, type MaterialsFilterValue } from "./materials-status-filter";

/**
 * The Materials Library (`.material-library` in the redesign prototype): the
 * section head with its one Upload button, the status filter, and a
 * three-column table (File, Status, Actions). Below `md` each row becomes a
 * stacked card (file, then status, then actions) with no header and no
 * sideways scroll. It is one markup with responsive classes; the table
 * elements keep explicit ARIA roles so they stay a table for screen readers
 * after their display changes.
 *
 * The filter lives here, in component state, not in the URL.
 */
export function MaterialsLibrary({
  spaceId,
  materials,
  loading,
  actionError,
  onUpload,
  onRetry,
  onDelete,
  onDownload,
}: {
  spaceId: string;
  materials: MaterialResponse[];
  loading: boolean;
  /** The last retry/download failure (T-09b plan step 4), announced here so
   * it's visible and reaches a screen reader without a toast library. */
  actionError?: string | null;
  onUpload: () => void;
  onRetry: (id: string) => void;
  onDelete: (material: MaterialResponse) => void;
  onDownload: (material: MaterialResponse) => void;
}) {
  const [filter, setFilter] = useState<MaterialsFilterValue>("all");
  const atLimit = materials.length >= MAX_MATERIALS_PER_SPACE;
  const visible = materials.filter((material) => matchesFilter(material, filter));

  return (
    <section aria-labelledby="materials-heading" className="mt-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="materials-heading" className="flex items-center gap-2 text-section text-foreground">
            Materials <CountChip count={materials.length} />
          </h2>
          <p className="mt-1 max-w-[42rem] text-muted-foreground">
            Upload lecture notes, PDFs or slides. We&apos;ll suggest topics for you to confirm.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 max-sm:w-full max-sm:items-stretch">
          <Button type="button" onClick={onUpload} disabled={atLimit} aria-disabled={atLimit}>
            <Plus aria-hidden="true" />
            Upload material
          </Button>
          {atLimit && (
            <p className="max-w-60 text-right text-sm text-muted-foreground max-sm:max-w-none max-sm:text-left">
              {MATERIAL_API_ERRORS.MATERIAL_LIMIT_REACHED.message}
            </p>
          )}
        </div>
      </header>

      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <MaterialsLibrarySkeleton />
      ) : materials.length === 0 ? (
        <MaterialsEmptyState onUpload={onUpload} disabled={atLimit} />
      ) : (
        <>
          <MaterialsStatusFilter materials={materials} value={filter} onChange={setFilter} />

          {visible.length === 0 ? (
            <Card className="px-6 py-8 text-center">
              <p className="text-muted-foreground">No materials with this status.</p>
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden p-0 max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <Table role="table" className="max-md:block">
                <caption className="sr-only">Materials in this Study Space</caption>
                <TableHeader role="rowgroup" className="max-md:sr-only">
                  <TableRow role="row">
                    <TableHead role="columnheader" scope="col" className="md:w-[44%]">
                      File
                    </TableHead>
                    <TableHead role="columnheader" scope="col" className="md:w-[30%]">
                      Status
                    </TableHead>
                    <TableHead role="columnheader" scope="col" className="md:w-[26%] md:text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody role="rowgroup" className="max-md:block max-md:[&_tr:last-child]:border">
                  {visible.map((material) => (
                    <TableRow
                      key={material.id}
                      role="row"
                      className="max-md:mb-3 max-md:block max-md:rounded-xl max-md:border max-md:border-border max-md:bg-card max-md:shadow-card"
                    >
                      <TableCell role="cell" className="align-top whitespace-normal max-md:block max-md:px-4 max-md:pt-4 max-md:pb-2 md:p-4">
                        <div className="flex items-start gap-3">
                          <MaterialTypeTile fileName={material.originalName} />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold break-words text-foreground">{material.originalName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {fileTypeLabel(material.originalName)} file · {formatMaterialSize(material.sizeBytes)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell role="cell" className="align-top whitespace-normal max-md:block max-md:px-4 max-md:py-2 md:p-4">
                        <MaterialStatusBadge material={material} detailed />
                      </TableCell>
                      <TableCell role="cell" className="align-top whitespace-normal max-md:block max-md:px-4 max-md:pt-2 max-md:pb-4 md:p-4">
                        <MaterialRowActions
                          spaceId={spaceId}
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
          )}

          <p className="text-sm text-muted-foreground">
            PDF, PPTX or TXT · Up to {MAX_MATERIAL_BYTES / 1_000_000} MB per file · Up to {MAX_MATERIALS_PER_SPACE} files
            per space · Private to this Study Space.
          </p>
        </>
      )}
    </section>
  );
}

function MaterialsLibrarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your materials.
      </p>
      {[0, 1].map((key) => (
        <Card key={key} className="gap-4 p-6" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <Skeleton className="h-6 w-3/5" />
          </div>
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-2/5" />
        </Card>
      ))}
    </div>
  );
}
