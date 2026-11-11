"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateSpaceDialog } from "./create-space-dialog";

/**
 * "My Study Spaces" title row (Figma node 37:2896). Every "New study
 * space" entry across the shell (sidebar "+", flyout, dashboard) links
 * here with `?create=1` to open the one Create dialog this page owns
 * (plan step 7); this component also opens it directly on click and
 * clears the query param again once the dialog closes.
 */
export function SpacesPageHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenFromUrl = searchParams.get("create") === "1";
  const [open, setOpen] = useState(shouldOpenFromUrl);

  // `?create=1` can appear after this component already mounted (a
  // soft navigation from the sidebar "+" while already on this page).
  // Adjusted during render — React's documented alternative to an
  // effect for syncing state to a changed prop — rather than a
  // `useEffect` that would call `setOpen` after the fact.
  const [prevShouldOpenFromUrl, setPrevShouldOpenFromUrl] = useState(shouldOpenFromUrl);
  if (shouldOpenFromUrl !== prevShouldOpenFromUrl) {
    setPrevShouldOpenFromUrl(shouldOpenFromUrl);
    if (shouldOpenFromUrl) setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && shouldOpenFromUrl) {
      router.replace("/spaces");
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
          My Study Spaces
        </h1>
        <p className="text-sm leading-[1.375rem] text-muted-foreground">
          Your private spaces to organise materials and study at your own pace.
        </p>
      </div>
      <Button
        type="button"
        className="shrink-0 gap-2 rounded-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        New study space
      </Button>
      <CreateSpaceDialog open={open} onOpenChange={handleOpenChange} />
    </div>
  );
}
