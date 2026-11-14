"use client";

import { useCallback, useEffect, useState } from "react";
import { MATERIAL_POLL_INTERVAL_MS } from "../materials-schemas";
import type { MaterialsClient, MaterialWithSize } from "../client/materials-client";

const ACTIVE_STATUSES = new Set(["uploading", "processing"]);

/**
 * The polling hook (plan step 7): re-fetches `client.list()` every
 * `MATERIAL_POLL_INTERVAL_MS` while any material is `uploading` or
 * `processing`, and stops otherwise (PRD Section 4, "Statuses the
 * student sees"). Wired to the example client for T-09a; T-09b only
 * swaps which `MaterialsClient` is passed in.
 *
 * `client` is expected to be stable for the component's lifetime (the
 * caller creates it once with `useState(() => ...)`).
 */
export function useMaterialsList(client: MaterialsClient) {
  const [materials, setMaterials] = useState<MaterialWithSize[]>([]);
  const [loading, setLoading] = useState(true);

  /** Exposed for callers to force an immediate refetch after a mutation
   * (upload, retry, delete) rather than waiting for the next poll tick. */
  const refresh = useCallback(async () => {
    const list = await client.list();
    setMaterials(list);
    setLoading(false);
  }, [client]);

  // The initial fetch is written inline, rather than calling `refresh`,
  // so this effect's body never calls setState synchronously itself —
  // only the async `load()` function does, after its `await` gap
  // (`react-hooks/set-state-in-effect`'s documented data-fetching shape).
  useEffect(() => {
    let ignore = false;
    async function load() {
      const list = await client.list();
      if (!ignore) {
        setMaterials(list);
        setLoading(false);
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

  return { materials, loading, refresh };
}
