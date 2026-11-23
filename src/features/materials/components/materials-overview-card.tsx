import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import type { MaterialResponse } from "../materials-schemas";
import { fileTypeLabel, formatMaterialSize } from "../materials-format";
import { MaterialStatusBadge } from "./material-status-badge";
import { MaterialTypeTile } from "./material-type-tile";

const PREVIEW_COUNT = 3;

/**
 * Overview's "Your materials" card (`#materials-title` in the redesign
 * prototype): the newest three materials with their type, size and status,
 * and a link to the full library. `materials` is already newest-first
 * (`listMaterials`'s contract). The Confirm topics action is not repeated in
 * these rows: the notice at the top of the page has it.
 */
export function MaterialsOverviewCard({ spaceId, materials }: { spaceId: string; materials: MaterialResponse[] }) {
  const preview = materials.slice(0, PREVIEW_COUNT);

  return (
    <Card role="region" aria-labelledby="materials-title" className="gap-0 p-0">
      <header className="flex flex-wrap items-start justify-between gap-2 p-6 max-sm:p-4">
        <div>
          <h2 id="materials-title" className="flex items-center gap-2 text-card-title text-foreground">
            Your materials <CountChip count={materials.length} />
          </h2>
          <p className="text-sm text-muted-foreground">Files and their preparation status</p>
        </div>
        <Button variant="ghost" nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials`} />}>
          View all
        </Button>
      </header>

      {/* A space can reach the populated layout with 0 materials (T-12b: a
          topic with quiz history keeps the Overview out of the empty state
          even after its last material is deleted), so this card needs its
          own empty line and upload link. */}
      {materials.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t border-border p-6 max-sm:p-4">
          <p className="text-sm text-muted-foreground">No materials yet.</p>
          <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials?upload=1`} />}>
            Upload material
          </Button>
        </div>
      ) : (
        <ul>
          {preview.map((material) => (
            <li
              key={material.id}
              className="flex flex-wrap items-start gap-4 border-t border-border px-6 py-4 max-sm:gap-2 max-sm:px-4"
            >
              <MaterialTypeTile fileName={material.originalName} />
              <div className="min-w-40 flex-1">
                <h3 className="font-semibold break-words text-foreground">{material.originalName}</h3>
                <p className="text-sm text-muted-foreground">
                  {fileTypeLabel(material.originalName)} · {formatMaterialSize(material.sizeBytes)}
                </p>
              </div>
              <div className="shrink-0 self-center max-sm:ml-14">
                <MaterialStatusBadge material={material} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
