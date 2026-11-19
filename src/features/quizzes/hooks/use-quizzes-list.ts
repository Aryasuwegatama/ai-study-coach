"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SET_POLL_INTERVAL_MS, type SetListItemResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";

function listErrorMessage(error: unknown): string {
  return error instanceof QuizzesClientError ? error.message : "Couldn't load your quizzes. Try again.";
}

/**
 * The Quiz Library's polling hook (issue #46, plan step 4; same shape as
 * `use-materials-list.ts`): re-fetches `client.listSets()` every
 * `SET_POLL_INTERVAL_MS` while any quiz is `generating`, and stops
 * otherwise, so T-12b only swaps the client, not this hook.
 *
 * A failed first load sets `error`; once a list has loaded successfully
 * at least once, a later failed poll just keeps the last good list and
 * quietly retries on the next tick.
 *
 * `client` is expected to be stable for the component's lifetime (the
 * caller creates it once with `useState(() => ...)`).
 */
export function useQuizzesList(client: QuizzesClient) {
  const [sets, setSets] = useState<SetListItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await client.listSets();
      setSets(list);
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
        const list = await client.listSets();
        if (ignore) return;
        setSets(list);
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

  const hasGeneratingSet = sets.some((set) => set.status === "generating");

  useEffect(() => {
    if (!hasGeneratingSet) return;
    const interval = setInterval(() => {
      void refresh();
    }, SET_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasGeneratingSet, refresh]);

  return { sets, loading, error, refresh };
}
