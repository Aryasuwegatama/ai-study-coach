import { MATERIAL_API_ERRORS } from "../materials-schemas";
import { MATERIALS_SAMPLE_EMPTY, materialsSampleLibrary } from "../fixtures/materials-sample-library";
import { simulateUpload } from "../fixtures/materials-sample-upload";
import type { MaterialExample } from "../fixtures/materials-sample-types";
import { MaterialsClientError, type MaterialsClient, type MaterialWithSize } from "./materials-client";

/**
 * T-09a's only implementation of `MaterialsClient` (plan step 4),
 * backed by the sample fixtures instead of the real API. T-09b deletes
 * this file along with the rest of `fixtures/` once it adds the real
 * implementation against the live routes.
 *
 * State lives at module scope so it survives across this component
 * tree's remounts for the length of the browser tab, the same way a
 * real list would stay put between navigations; a full page reload
 * resets it back to the fixtures.
 */
let library: MaterialExample[] = MATERIALS_SAMPLE_EMPTY
  ? []
  : materialsSampleLibrary.map((material) => ({ ...material }));

/**
 * Listed field-by-field, rather than destructuring `forceDeleteFailure`
 * away, so that T-09a-only flag (see `materials-sample-types.ts`) can
 * never leak into the UI's data shape.
 */
function toResponse(material: MaterialExample): MaterialWithSize {
  return {
    id: material.id,
    originalName: material.originalName,
    status: material.status,
    stage: material.stage,
    progress: material.progress,
    error: material.error,
    pageCount: material.pageCount,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    sizeBytes: material.sizeBytes,
  };
}

function isDuplicateName(name: string, excludingId: string): boolean {
  return library.some(
    (material) => material.id !== excludingId && material.originalName.toLowerCase() === name.toLowerCase(),
  );
}

export function createExampleMaterialsClient(): MaterialsClient {
  return {
    async list() {
      return library.map(toResponse);
    },

    async upload(file, { onProgress, signal }) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const material: MaterialExample = {
        id,
        originalName: file.name,
        status: "uploading",
        stage: null,
        progress: null,
        error: null,
        pageCount: null,
        sizeBytes: file.size,
        createdAt: now,
        updatedAt: now,
      };
      // Inserted before the first `await`, so a caller that kicks this
      // promise off without awaiting it (to refresh the library right
      // away, as `material-upload-dialog.tsx` does) already sees the
      // new "uploading" row.
      library = [material, ...library];

      try {
        await simulateUpload({ onProgress, signal });
      } catch (error) {
        library = library.filter((candidate) => candidate.id !== id);
        throw error;
      }

      if (isDuplicateName(file.name, id)) {
        library = library.filter((candidate) => candidate.id !== id);
        throw new MaterialsClientError("DUPLICATE_FILE", MATERIAL_API_ERRORS.DUPLICATE_FILE.message);
      }

      const processing: MaterialExample = {
        ...material,
        status: "processing",
        stage: "extract",
        updatedAt: new Date().toISOString(),
      };
      library = library.map((candidate) => (candidate.id === id ? processing : candidate));
      return toResponse(processing);
    },

    async retry(id) {
      const material = library.find((candidate) => candidate.id === id);
      if (!material) {
        throw new MaterialsClientError("MATERIAL_NOT_FOUND", MATERIAL_API_ERRORS.MATERIAL_NOT_FOUND.message);
      }
      if (material.status !== "failed") {
        throw new MaterialsClientError(
          "INVALID_MATERIAL_STATE",
          MATERIAL_API_ERRORS.INVALID_MATERIAL_STATE.message,
        );
      }

      const retried: MaterialExample = {
        ...material,
        status: "processing",
        stage: "extract",
        error: null,
        updatedAt: new Date().toISOString(),
      };
      library = library.map((candidate) => (candidate.id === id ? retried : candidate));
      return toResponse(retried);
    },

    async remove(id) {
      const material = library.find((candidate) => candidate.id === id);
      if (material?.forceDeleteFailure) {
        // Mirrors the message `MATERIAL_DELETE_FAILED` will carry once
        // T-06b adds it to `materials-schemas.ts` (issue #25 decision);
        // hard-coded here only because that code doesn't exist yet.
        throw new MaterialsClientError("MATERIAL_DELETE_FAILED", "Couldn't delete this file. Try again.");
      }
      library = library.filter((candidate) => candidate.id !== id);
    },

    download(material) {
      if (typeof document === "undefined") return;
      const blob = new Blob(
        [
          `This is example data from the AI Study Coach Materials screen.\n\n"${material.originalName}" has no real file attached — T-09b replaces this with the real download.`,
        ],
        { type: "text/plain" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${material.originalName.replace(/\.[^.]+$/, "")}-example.txt`;
      link.click();
      URL.revokeObjectURL(url);
    },
  };
}
