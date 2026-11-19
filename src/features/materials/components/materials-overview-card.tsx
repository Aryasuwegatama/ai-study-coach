import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MaterialResponse } from "../materials-schemas";
import { MaterialStatusBadge } from "./material-status-badge";

const PREVIEW_COUNT = 3;

/**
 * The populated Overview's "Materials · N" card (T-09c; Figma node
 * 47:17982/47:18147): the newest three materials with their status and a
 * link to the full library. `materials` is already newest-first
 * (`listMaterials`'s contract).
 */
export function MaterialsOverviewCard({ spaceId, materials }: { spaceId: string; materials: MaterialResponse[] }) {
  const preview = materials.slice(0, PREVIEW_COUNT);
  const remaining = materials.length - preview.length;

  // A space can reach the populated layout with 0 materials (T-12b: a
  // topic with quiz history keeps the Overview out of the Welcome card
  // even after its last material is deleted), so this card needs its own
  // empty line and upload link rather than an empty list with nothing
  // underneath it.
  if (materials.length === 0) {
    return (
      <Card className="rounded-[20px] p-6">
        <CardContent className="flex flex-col gap-4 p-0">
          <h2 className="text-lg font-semibold text-foreground">Materials · 0</h2>
          <p className="text-sm text-muted-foreground">No materials yet.</p>
          <Button
            type="button"
            className="w-fit rounded-full"
            nativeButton={false}
            render={<Link href={`/spaces/${spaceId}/materials?upload=1`} />}
          >
            Upload material
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[20px] p-6">
      <CardContent className="flex flex-col gap-4 p-0">
        <h2 className="text-lg font-semibold text-foreground">Materials · {materials.length}</h2>
        <ul className="flex flex-col gap-3">
          {preview.map((material) => (
            <li key={material.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{material.originalName}</span>
              <MaterialStatusBadge material={material} />
            </li>
          ))}
        </ul>
        {remaining > 0 && <p className="text-xs text-muted-foreground">{remaining} more materials in this space</p>}
        <Button
          type="button"
          variant="outline"
          className="w-fit rounded-full"
          nativeButton={false}
          render={<Link href={`/spaces/${spaceId}/materials`} />}
        >
          View materials
        </Button>
      </CardContent>
    </Card>
  );
}
