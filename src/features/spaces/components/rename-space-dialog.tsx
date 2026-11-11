"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpaceNameField } from "./space-name-field";

/**
 * Reuses the Create dialog's layout, prefilled with the current name
 * (plan: "Rename and delete have no Figma design"). Stays on the
 * Overview page on success; `router.refresh()` is what updates the
 * header, sidebar and breadcrumb (plan risk: "Stale lists").
 */
export function RenameSpaceDialog({
  spaceId,
  initialName,
  open,
  onOpenChange,
}: {
  spaceId: string;
  initialName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Re-sync the field when the dialog is (re)opened after the name
  // changed elsewhere — adjusted during render (React's documented
  // alternative to an effect for this), not in a `useEffect`.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(initialName);
      setError(undefined);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }

      onOpenChange(false);
      setPending(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename study space</DialogTitle>
          </DialogHeader>
          <SpaceNameField
            id="rename-space-name"
            value={name}
            onChange={setName}
            error={error}
            disabled={pending}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full gap-2" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
