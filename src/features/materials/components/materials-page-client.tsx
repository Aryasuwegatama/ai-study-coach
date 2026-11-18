"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_MATERIALS_PER_SPACE, type MaterialResponse } from "../materials-schemas";
import { createApiMaterialsClient } from "../client/api-materials-client";
import { MaterialsClientError } from "../client/materials-client";
import { useMaterialsList } from "../hooks/use-materials-list";
import { DeleteMaterialDialog } from "./delete-material-dialog";
import { MaterialUploadDialog } from "./material-upload-dialog";
import { MaterialsLibrary } from "./materials-library";
import { MaterialsListError } from "./materials-list-error";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Owns the real `MaterialsClient` (T-09b), the polling hook and both
 * dialogs (issue #25 / #42, plan steps 2–4). `?upload=1` opens the upload
 * dialog the same way `/spaces?create=1` opens Create Study Space, so the
 * Overview's "Upload material" button can link straight here.
 */
export function MaterialsPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createApiMaterialsClient(spaceId));
  const { materials, loading, error, refresh } = useMaterialsList(client);
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenFromUrl = searchParams.get("upload") === "1";
  const [uploadOpen, setUploadOpen] = useState(shouldOpenFromUrl);
  const [prevShouldOpenFromUrl, setPrevShouldOpenFromUrl] = useState(shouldOpenFromUrl);
  if (shouldOpenFromUrl !== prevShouldOpenFromUrl) {
    setPrevShouldOpenFromUrl(shouldOpenFromUrl);
    if (shouldOpenFromUrl) setUploadOpen(true);
  }
  const [deleteTarget, setDeleteTarget] = useState<MaterialResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleUploadOpenChange(nextOpen: boolean) {
    setUploadOpen(nextOpen);
    if (!nextOpen && shouldOpenFromUrl) {
      router.replace(`/spaces/${spaceId}/materials`);
    }
  }

  async function handleRetry(id: string) {
    try {
      await client.retry(id);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof MaterialsClientError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      void refresh();
    }
  }

  async function handleDownload(material: MaterialResponse) {
    try {
      await client.download(material);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof MaterialsClientError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  }

  const atLimit = materials.length >= MAX_MATERIALS_PER_SPACE;

  // The first load failed and nothing has loaded yet: replace the library
  // (and its endless skeleton) with a dedicated error state and a manual
  // retry (T-09b plan step 4, "List errors").
  if (error && materials.length === 0 && !loading) {
    return (
      <>
        <MaterialsListError message={error} onRetry={refresh} />
        <MaterialUploadDialog
          open={uploadOpen}
          onOpenChange={handleUploadOpenChange}
          client={client}
          atLimit={atLimit}
          onUploaded={refresh}
        />
      </>
    );
  }

  return (
    <>
      <MaterialsLibrary
        spaceId={spaceId}
        materials={materials}
        loading={loading}
        actionError={actionError}
        onUpload={() => setUploadOpen(true)}
        onRetry={(id) => void handleRetry(id)}
        onDelete={setDeleteTarget}
        onDownload={(material) => void handleDownload(material)}
      />
      <MaterialUploadDialog
        open={uploadOpen}
        onOpenChange={handleUploadOpenChange}
        client={client}
        atLimit={atLimit}
        onUploaded={refresh}
      />
      <DeleteMaterialDialog
        material={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        client={client}
        onDeleted={refresh}
      />
    </>
  );
}
