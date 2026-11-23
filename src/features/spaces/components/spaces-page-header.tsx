"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountChip } from "@/components/count-chip";
import { PageHead } from "@/components/page-container";
import { CreateSpaceDialog } from "./create-space-dialog";

/**
 * "Study Spaces" title row: the heading with its count chip, the subtitle
 * and the primary Create button. Every "Create study space" entry across the shell (sidebar "+", flyout, dashboard) links
 * here with `?create=1` to open the one Create dialog this page owns
 * (plan step 7); this component also opens it directly on click and
 * clears the query param again once the dialog closes.
 */
export function SpacesPageHeader({ count }: { count: number }) {
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
    <PageHead
      title={
        <>
          Study Spaces <CountChip count={count} />
        </>
      }
      subtitle="Your private spaces, organised by subject."
    >
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Create study space
      </Button>
      <CreateSpaceDialog open={open} onOpenChange={handleOpenChange} />
    </PageHead>
  );
}
