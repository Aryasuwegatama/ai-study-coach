"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SET_POLL_INTERVAL_MS } from "@/features/quizzes/quizzes-schemas";
import type { DeckListItemResponse } from "../flashcards-schemas";
import { FlashcardsClientError, type FlashcardsClient } from "../client/flashcards-client";

function listErrorMessage(error: unknown): string {
  return error instanceof FlashcardsClientError ? error.message : "Couldn't load your flashcards. Try again.";
}

/**
 * The Deck Library's polling hook (same shape as `use-quizzes-list.ts`):
 * re-fetches `client.listDecks()` every `SET_POLL_INTERVAL_MS` while any deck is
 * `generating`, and stops otherwise. The list loads in an effect, so it
 * reloads when Cache Components shows this page again after a visit elsewhere.
 *
 * A failed first load sets `error`; once a list has loaded at least once, a
 * later failed poll keeps the last good list and quietly retries.
 *
 * `client` is expected to be stable for the component's lifetime.
 */
export function useDecksList(client: FlashcardsClient) {
  const [decks, setDecks] = useState<DeckListItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await client.listDecks();
      setDecks(list);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (!hasLoadedOnceRef.current) setError(listErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const list = await client.listDecks();
        if (ignore) return;
        setDecks(list);
        setError(null);
        hasLoadedOnceRef.current = true;
      } catch (err) {
        if (ignore) return;
        if (!hasLoadedOnceRef.current) setError(listErrorMessage(err));
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [client]);

  const hasGeneratingDeck = decks.some((deck) => deck.status === "generating");

  useEffect(() => {
    if (!hasGeneratingDeck) return;
    const interval = setInterval(() => {
      void refresh();
    }, SET_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasGeneratingDeck, refresh]);

  return { decks, loading, error, refresh };
}
