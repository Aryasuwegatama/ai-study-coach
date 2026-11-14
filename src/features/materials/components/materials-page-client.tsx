"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_MATERIALS_PER_SPACE } from "../materials-schemas";
import { createExampleMaterialsClient } from "../client/example-materials-client";
import type { MaterialWithSize } from "../client/materials-client";
import { useMaterialsList } from "../hooks/use-materials-list";
import { DeleteMaterialDialog } from "./delete-material-dialog";
import { MaterialUploadDialog } from "./material-upload-dialog";
import { MaterialsLibrary } from "./materials-library";

/**
 * Owns the example `MaterialsClient`, the polling hook and both dialogs
 * (issue #25, plan steps 4–7). `?upload=1` opens the upload dialog the
 * same way `/spaces?create=1` opens Create Study Space, so the
 * Overview's "Upload material" button can link straight here.
 */
export function MaterialsPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createExampleMaterialsClient());
  const { materials, loading, refresh } = useMaterialsList(client);
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenFromUrl = searchParams.get("upload") === "1";
  const [uploadOpen, setUploadOpen] = useState(shouldOpenFromUrl);
  const [prevShouldOpenFromUrl, setPrevShouldOpenFromUrl] = useState(shouldOpenFromUrl);
  if (shouldOpenFromUrl !== prevShouldOpenFromUrl) {
    setPrevShouldOpenFromUrl(shouldOpenFromUrl);
    if (shouldOpenFromUrl) setUploadOpen(true);
  }
  const [deleteTarget, setDeleteTarget] = useState<MaterialWithSize | null>(null);

  function handleUploadOpenChange(nextOpen: boolean) {
    setUploadOpen(nextOpen);
    if (!nextOpen && shouldOpenFromUrl) {
      router.replace(`/spaces/${spaceId}/materials`);
    }
  }

  const atLimit = materials.length >= MAX_MATERIALS_PER_SPACE;

  return (
    <>
      <MaterialsLibrary
        materials={materials}
        loading={loading}
        onUpload={() => setUploadOpen(true)}
        onRetry={(id) => {
          void client.retry(id).then(refresh);
        }}
        onDelete={setDeleteTarget}
        onDownload={(material) => client.download(material)}
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
