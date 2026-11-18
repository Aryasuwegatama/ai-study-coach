import { put } from "@vercel/blob/client";
import {
  ACCEPTED_FILE_TYPES,
  MATERIAL_API_ERRORS,
  MATERIAL_FAILURE_REASONS,
  type CreateMaterialResponse,
  type MaterialResponse,
} from "../materials-schemas";
import { MaterialsClientError, type MaterialsClient, type UploadOptions } from "./materials-client";

/**
 * T-09b's real `MaterialsClient` (plan step 2), against the T-06a/T-06b
 * Materials API and the browser upload flow documented at the bottom of
 * `materials-schemas.ts` (create → browser `put()` → complete). Runs
 * entirely in the browser: no `"use server"`, no secrets, no direct
 * `@vercel/blob` server import — `put()` here is `@vercel/blob/client`'s
 * client-token version.
 */

type ErrorBody = { error?: { code?: string; message?: string } };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A 401 means the session is gone; the contract has no body worth reading.
 * A full navigation, not `router.push()`, is deliberate: this module has
 * no React tree to call a hook from (it's the plain `MaterialsClient`
 * factory), and a hard reload also clears any stale client state.
 */
function goToSignIn(): MaterialsClientError {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above
  if (typeof window !== "undefined") window.location.href = "/sign-in";
  return new MaterialsClientError("UNAUTHORIZED", "Your session has expired. Sign in again.");
}

async function errorFromResponse(response: Response): Promise<MaterialsClientError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new MaterialsClientError(body.error?.code ?? "VALIDATION_ERROR", body.error?.message ?? GENERIC_ERROR_MESSAGE);
}

/** Every non-2xx response becomes a `MaterialsClientError`; a 401 sends the student to `/sign-in`. */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) throw goToSignIn();
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function mimeTypeForName(name: string): string {
  const lower = name.toLowerCase();
  return ACCEPTED_FILE_TYPES.find((type) => lower.endsWith(type.extension))?.mimeType ?? "application/octet-stream";
}

/** Best effort: a cancel never fails loudly over the delete that cleans it up. */
async function deleteBestEffort(materialId: string): Promise<void> {
  await fetch(`/api/materials/${materialId}`, { method: "DELETE" }).catch(() => undefined);
}

function cancelledError(): DOMException {
  return new DOMException("The upload was cancelled.", "AbortError");
}

/**
 * Complete can answer 409 `UPLOAD_INCOMPLETE` while the blob the browser
 * just finished sending isn't visible to the server yet (plan step 4,
 * "Complete answers 409"). Retried twice with a short wait before giving up
 * and showing the contract's message; the row stays `uploading` either way.
 */
async function completeWithRetry(materialId: string): Promise<MaterialResponse> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`/api/materials/${materialId}/complete`, { method: "POST" });
    if (response.status === 401) throw goToSignIn();
    if (response.ok) {
      const data = (await response.json()) as { material: MaterialResponse };
      return data.material;
    }
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    const incomplete = response.status === 409 && body.error?.code === "UPLOAD_INCOMPLETE";
    if (!incomplete || attempt === maxAttempts) {
      throw new MaterialsClientError(
        body.error?.code ?? "VALIDATION_ERROR",
        body.error?.message ?? MATERIAL_API_ERRORS.UPLOAD_INCOMPLETE.message,
      );
    }
    await sleep(attempt * 1000);
  }
  // Unreachable: the loop above always returns or throws.
  throw new MaterialsClientError("UPLOAD_INCOMPLETE", MATERIAL_FAILURE_REASONS.PROCESSING_FAILED);
}

export function createApiMaterialsClient(spaceId: string): MaterialsClient {
  return {
    async list() {
      const data = await requestJson<{ materials: MaterialResponse[] }>(`/api/spaces/${spaceId}/materials`);
      return data.materials;
    },

    async upload(file, { onProgress, onCreated, signal }: UploadOptions) {
      // Step 1: the row only exists once this returns.
      const created = await requestJson<CreateMaterialResponse>(`/api/spaces/${spaceId}/materials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const materialId = created.material.id;
      onCreated?.();

      // Cancelled while step 1 was in flight: the row is removed now that
      // it exists (plan: "An abort during step 1 deletes the row once step
      // 1 returns").
      if (signal.aborted) {
        await deleteBestEffort(materialId);
        throw cancelledError();
      }

      // Step 2: the browser's own upload, using the create step's token.
      try {
        await put(created.upload.pathname, file, {
          access: "private",
          token: created.upload.clientToken,
          contentType: mimeTypeForName(file.name),
          onUploadProgress: (event) => onProgress(Math.round(event.percentage)),
          abortSignal: signal,
        });
      } catch (error) {
        if (signal.aborted) await deleteBestEffort(materialId);
        throw error;
      }

      if (signal.aborted) {
        await deleteBestEffort(materialId);
        throw cancelledError();
      }

      // Step 3: tell the server the file landed.
      return completeWithRetry(materialId);
    },

    async retry(id) {
      const data = await requestJson<{ material: MaterialResponse }>(`/api/materials/${id}/retry`, { method: "POST" });
      return data.material;
    },

    async remove(id) {
      await requestJson<void>(`/api/materials/${id}`, { method: "DELETE" });
    },

    async download(material) {
      const response = await fetch(`/api/materials/${material.id}/file`);
      if (response.status === 401) throw goToSignIn();
      if (!response.ok) throw await errorFromResponse(response);
      const blob = await response.blob();
      if (typeof document === "undefined") return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = material.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  };
}
