import type { MaterialResponse } from "../materials-schemas";

/**
 * T-06b adds `sizeBytes` to `MaterialResponse` itself (issue #25 decision:
 * "File size is shown, as in Figma... Until that merges, the example data
 * type adds `sizeBytes` itself; T-09b removes that."). Every screen in this
 * feature reads size through this type, not `MaterialResponse` directly, so
 * T-09b only has to delete this line, not touch every component.
 */
export type MaterialWithSize = MaterialResponse & { sizeBytes: number };

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
  signal: AbortSignal;
};

/**
 * T-09a's data interface (plan step 4): the one shape every Materials
 * screen talks to for list, upload (with progress and cancel), retry,
 * delete and download. `example-materials-client.ts` is T-09a's only
 * implementation, built against the sample fixtures; T-09b adds the real
 * one against the live API and Blob upload, and no component changes when
 * it swaps over.
 */
export type MaterialsClient = {
  list(): Promise<MaterialWithSize[]>;
  upload(file: File, options: UploadOptions): Promise<MaterialWithSize>;
  retry(id: string): Promise<MaterialWithSize>;
  remove(id: string): Promise<void>;
  download(material: MaterialWithSize): void;
};
