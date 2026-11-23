"use client";

import { useState } from "react";
import { createApiFlashcardsClient } from "../client/api-flashcards-client";
import { FlashcardsClientError } from "../client/flashcards-client";
import type { DeckListItemResponse } from "../flashcards-schemas";
import { useDecksList } from "../hooks/use-decks-list";
import { DeckLibrary } from "./deck-library";
import { DecksListError } from "./decks-list-error";
import { DeleteDeckDialog } from "./delete-deck-dialog";
import { RenameSetDialog } from "@/features/quizzes/components/rename-set-dialog";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Owns the real `FlashcardsClient`, the polling hook and the delete dialog
 * (the same split `quizzes-page-client.tsx` uses). */
export function DecksPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createApiFlashcardsClient(spaceId));
  const { decks, loading, error, refresh } = useDecksList(client);
  const [deleteTarget, setDeleteTarget] = useState<DeckListItemResponse | null>(null);
  const [renameTarget, setRenameTarget] = useState<DeckListItemResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleDeleteDialogClose(open: boolean) {
    if (!open) setDeleteTarget(null);
  }

  // The first load failed and nothing has loaded yet: a dedicated error state with a retry.
  if (error && decks.length === 0 && !loading) {
    return <DecksListError message={error} onRetry={refresh} />;
  }

  return (
    <>
      <DeckLibrary
        spaceId={spaceId}
        decks={decks}
        loading={loading}
        actionError={actionError}
        onDelete={(deck) => {
          setActionError(null);
          setDeleteTarget(deck);
        }}
        onRename={(deck) => {
          setActionError(null);
          setRenameTarget(deck);
        }}
      />
      <RenameSetDialog
        set={renameTarget}
        noun="deck"
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        rename={client.renameDeck}
        onRenamed={() => void refresh()}
      />
      <DeleteDeckDialog
        deck={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={handleDeleteDialogClose}
        client={client}
        onDeleted={() =>
          void refresh().catch((err) => {
            setActionError(err instanceof FlashcardsClientError ? err.message : GENERIC_ERROR_MESSAGE);
          })
        }
      />
    </>
  );
}
