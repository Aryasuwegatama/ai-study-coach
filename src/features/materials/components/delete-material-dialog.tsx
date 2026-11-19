"use client";

import { useState } from "react";
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
import type { MaterialResponse } from "../materials-schemas";
import { MaterialsClientError, type MaterialsClient } from "../client/materials-client";

/**
 * Delete has no Figma design (issue #25): the same confirmation pattern
 * as `delete-space-dialog.tsx`, with the wording the issue specifies.
 * "Delete removes for real" (T-06b decision) — on failure the row stays
 * and the student sees the `MATERIAL_DELETE_FAILED` message.
 */
export function DeleteMaterialDialog({
  material,
  open,
  onOpenChange,
  client,
  onDeleted,
}: {
  material: MaterialResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: MaterialsClient;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    if (!nextOpen) setError(undefined);
    onOpenChange(nextOpen);
  }

  async function handleDelete() {
    if (!material || pending) return;
    setPending(true);
    setError(undefined);

    try {
      await client.remove(material.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof MaterialsClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{material?.originalName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the file from this space and from future quizzes, cards and mistake reviews. Past quiz
            results stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* T-09c, Arya 2026-11-19: a topic found only in this file is
            deleted with it, unless the student has already made a quiz
            or flashcards from it — those stay, with their history. */}
        <p className="text-sm text-muted-foreground">
          Topics found only in this file are removed. Topics you&apos;ve made quizzes or flashcards from move to
          &quot;Topics from deleted materials&quot;, and their results stay.
        </p>
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
