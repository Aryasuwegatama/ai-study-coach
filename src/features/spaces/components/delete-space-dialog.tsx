"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The confirm button is the solid destructive Button variant. Wording never claims complete erasure (PRD Section 2 /
 * privacy policy): the space becomes inaccessible immediately, but the
 * row is only soft-deleted until the later cleanup job runs.
 */
export function DeleteSpaceDialog({
  spaceId,
  name,
  open,
  onOpenChange,
}: {
  spaceId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    if (!nextOpen) setError(undefined);
    onOpenChange(nextOpen);
  }

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/spaces/${spaceId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }

      onOpenChange(false);
      router.push("/spaces");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Its materials, topics and practice will no longer be available in this workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleDelete()}
            disabled={pending}
            variant="destructive"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Delete space
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
