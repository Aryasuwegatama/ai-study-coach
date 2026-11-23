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
 * Delete (PRD Section 2 "Materials"). "Delete removes for real" (T-06b
 * decision) — on failure the row stays and the student sees the
 * `MATERIAL_DELETE_FAILED` message. A file still processing or uploading gets
 * its own wording ("Cancel processing and delete?"), but the same API call.
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
  // Keep the wording of the row that opened the dialog, also while it fades
  // out (the target is cleared on close). Adjusted during render rather than
  // in an effect.
  const [inProgress, setInProgress] = useState(false);
  const [shown, setShown] = useState<MaterialResponse | null>(null);
  if (material && material !== shown) {
    setShown(material);
    setInProgress(material.status === "uploading" || material.status === "processing");
  }

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

  const fileName = (material ?? shown)?.originalName ?? "";

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-md">
        {inProgress ? (
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel processing and delete?</AlertDialogTitle>
            <AlertDialogDescription>
              Processing will stop and <strong className="font-semibold break-words text-foreground">{fileName}</strong>{" "}
              will be removed from this space.
            </AlertDialogDescription>
          </AlertDialogHeader>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete material?</AlertDialogTitle>
              <p className="font-semibold break-words text-foreground">{fileName}</p>
              <AlertDialogDescription>
                The file will no longer be available in this space or for new quizzes and flashcards. Previous quiz
                results will be kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* T-09c, Arya 2026-11-19: a topic found only in this file is
                deleted with it, unless the student has already made a quiz
                or flashcards from it — those stay, with their history. */}
            <p className="text-sm text-muted-foreground">
              Topics used in past practice will move to &lsquo;Topics from deleted materials&rsquo;. Unused topics
              linked only to this file will be removed.
            </p>
          </>
        )}
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{inProgress ? "Keep processing" : "Keep material"}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void handleDelete()} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {inProgress ? "Cancel and delete" : "Delete material"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
