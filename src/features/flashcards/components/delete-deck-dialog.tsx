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
import type { DeckListItemResponse } from "../flashcards-schemas";
import { FlashcardsClientError, type FlashcardsClient } from "../client/flashcards-client";

/**
 * Delete confirmation for a deck. A deck can always be deleted (ratings aren't
 * mastery evidence, unlike quiz results); an unfinished practice goes with it,
 * and the confirmation says so.
 */
export function DeleteDeckDialog({
  deck,
  open,
  onOpenChange,
  client,
  onDeleted,
}: {
  deck: DeckListItemResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: FlashcardsClient;
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
    if (!deck || pending) return;
    setPending(true);
    setError(undefined);

    try {
      await client.deleteDeck(deck.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof FlashcardsClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const unfinished = deck?.latestSession.status === "in_progress";

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{deck?.title}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the deck from your library
            {unfinished ? ", including your unfinished practice" : ""}. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep deck</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleDelete()}
            disabled={pending}
            variant="destructive"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Delete deck
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
