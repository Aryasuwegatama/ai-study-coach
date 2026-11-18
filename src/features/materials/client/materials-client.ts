import type { MaterialResponse } from "../materials-schemas";

/** Thrown by `MaterialsClient` methods for a server-shaped failure (a stable
 * `MATERIAL_API_ERRORS`/`MATERIAL_DELETE_FAILED` code and its message), so
 * callers can show the exact contract message without inspecting strings. */
export class MaterialsClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type UploadOptions = {
  onProgress: (percent: number) => void;
  /**
   * Called once the material's row exists (the create step has returned),
   * before the browser `put()` starts (T-09b plan step 4, "Order of the
   * first refresh"): the row can only be refreshed into view once this
   * fires, not right after `upload()` is called.
   */
  onCreated?: () => void;
  /**
   * Called once the file has fully reached Blob (`put()` resolved) and the
   * upload is no longer cancellable (Codex review on #43): cancelling
   * from this point would have no effect on an in-flight or retried
   * `complete`, so the dialog switches to a non-cancellable "Checking
   * your file" step here instead of promising a cancel it can't honour.
   */
  onSent?: () => void;
  signal: AbortSignal;
};

/**
 * T-09a's data interface (plan step 4): the one shape every Materials
 * screen talks to for list, upload (with progress and cancel), retry,
 * delete and download. `api-materials-client.ts` (T-09b) is the real
 * implementation, against the live API and Blob upload; no component
 * changes when it swaps over.
 */
export type MaterialsClient = {
  list(): Promise<MaterialResponse[]>;
  upload(file: File, options: UploadOptions): Promise<MaterialResponse>;
  retry(id: string): Promise<MaterialResponse>;
  remove(id: string): Promise<void>;
  /** A navigation hides a server error behind a raw JSON page, so this
   * fetches the file itself and throws `MaterialsClientError` on failure
   * instead (plan step 4, "Download of a missing file"). */
  download(material: MaterialResponse): Promise<void>;
};
