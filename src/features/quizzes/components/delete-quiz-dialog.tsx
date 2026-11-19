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
import type { SetListItemResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";

/**
 * Delete confirmation for a quiz with no submitted attempt (PRD Section 2
 * and #35; issue #46). The library only ever opens this for a quiz with
 * `hasResults === false`, but the server's
 * `SET_HAS_RESULTS` message is still shown here if that's ever hit (a
 * stale card from before a submit lands elsewhere).
 */
export function DeleteQuizDialog({
  quiz,
  open,
  onOpenChange,
  client,
  onDeleted,
}: {
  quiz: SetListItemResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: QuizzesClient;
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
    if (!quiz || pending) return;
    setPending(true);
    setError(undefined);

    try {
      await client.deleteSet(quiz.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{quiz?.title}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the quiz from your library. This can&apos;t be undone.
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
