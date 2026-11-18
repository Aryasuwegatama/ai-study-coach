"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MATERIAL_POLL_INTERVAL_MS, type MaterialResponse } from "../materials-schemas";
import { MaterialsClientError, type MaterialsClient } from "../client/materials-client";

const ACTIVE_STATUSES = new Set(["uploading", "processing"]);

function listErrorMessage(error: unknown): string {
  return error instanceof MaterialsClientError ? error.message : "Couldn't load your materials. Try again.";
}

/**
 * The polling hook (plan step 7; T-09b's plan step 4, "List errors"):
 * re-fetches `client.list()` every `MATERIAL_POLL_INTERVAL_MS` while any
 * material is `uploading` or `processing`, and stops otherwise (PRD
 * Section 4, "Statuses the student sees").
 *
 * A failed first load sets `error`, so the screen can show a "Try again"
 * button instead of an endless skeleton. Once a list has loaded
 * successfully at least once, a later failed poll (network blip, a 500)
 * just keeps the last good list and quietly retries on the next tick —
 * `error` is only ever set before that first success.
 *
 * `client` is expected to be stable for the component's lifetime (the
 * caller creates it once with `useState(() => ...)`).
 */
export function useMaterialsList(client: MaterialsClient) {
  const [materials, setMaterials] = useState<MaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  /** Exposed for callers to force an immediate refetch after a mutation
   * (upload, retry, delete) rather than waiting for the next poll tick. */
  const refresh = useCallback(async () => {
    try {
      const list = await client.list();
      setMaterials(list);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (!hasLoadedOnceRef.current) setError(listErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // The initial fetch is written inline, rather than calling `refresh`,
  // so this effect's body never calls setState synchronously itself —
  // only the async `load()` function does, after its `await` gap
  // (`react-hooks/set-state-in-effect`'s documented data-fetching shape).
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const list = await client.list();
        if (ignore) return;
        setMaterials(list);
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

  const hasActiveMaterial = materials.some((material) => ACTIVE_STATUSES.has(material.status));

  useEffect(() => {
    if (!hasActiveMaterial) return;
    const interval = setInterval(() => {
      void refresh();
    }, MATERIAL_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActiveMaterial, refresh]);

  return { materials, loading, error, refresh };
}
