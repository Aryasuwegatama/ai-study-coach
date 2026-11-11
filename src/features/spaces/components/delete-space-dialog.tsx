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
 * No Figma design (plan: "Rename and delete have no Figma design"). The
 * confirm button is solid `--destructive` with white text rather than
 * the shared `AlertDialogAction`'s default primary styling — the plan
 * calls the tinted destructive Button variant too low-contrast for this
 * action. Wording never claims complete erasure (PRD Section 2 /
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
            You&apos;ll lose access to this space and everything in it straight away. This
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleDelete()}
            disabled={pending}
            className="gap-2 bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
