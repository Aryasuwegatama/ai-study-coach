"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteSpaceDialog } from "./delete-space-dialog";
import { RenameSpaceDialog } from "./rename-space-dialog";

/**
 * The space banner's "⋯" menu: **Rename space** and **Delete space**, on
 * every space page.
 */
export function SpaceOverviewActions({
  spaceId,
  name,
}: {
  spaceId: string;
  name: string;
}) {
  const [activeDialog, setActiveDialog] = useState<"rename" | "delete" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="icon" aria-label="Study space actions" />}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setActiveDialog("rename")}>Rename space</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setActiveDialog("delete")}>
            Delete space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameSpaceDialog
        spaceId={spaceId}
        initialName={name}
        open={activeDialog === "rename"}
        onOpenChange={(open) => setActiveDialog(open ? "rename" : null)}
      />
      <DeleteSpaceDialog
        spaceId={spaceId}
        name={name}
        open={activeDialog === "delete"}
        onOpenChange={(open) => setActiveDialog(open ? "delete" : null)}
      />
    </>
  );
}
