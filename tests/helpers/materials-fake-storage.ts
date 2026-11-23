import { vi } from "vitest";

const storage = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  reads: [] as string[],
  deleted: [] as string[],
  tokens: [] as {
    pathname: string;
    allowedContentTypes: string[];
    maxBytes: number;
    validUntil: number;
  }[],
  failDelete: false,
  beforeRead: undefined as ((path: string) => Promise<void>) | undefined,
}));

vi.mock("@/server/storage/storage-client", () => ({
  createUploadToken: vi.fn(async (options) => {
    storage.tokens.push(structuredClone(options));
    return "synthetic-upload-capability";
  }),
  blobExists: vi.fn(async (path: string) => storage.objects.has(path)),
  getPrivateBlob: vi.fn(async (path: string) => {
    storage.reads.push(path);
    const bytes = storage.objects.get(path);
    await storage.beforeRead?.(path);
    if (!bytes) return null;
    const blob = new Blob([Uint8Array.from(bytes)]);
    return { blob, stream: blob.stream(), statusCode: 200 };
  }),
  deleteBlob: vi.fn(async (path: string | string[]) => {
    if (storage.failDelete)
      throw new Error("synthetic-storage-secret-sentinel");
    for (const key of Array.isArray(path) ? path : [path]) {
      storage.objects.delete(key);
      storage.deleted.push(key);
    }
  }),
  putPrivateBlob: vi.fn(async () => {
    throw new Error("Unexpected external storage write in T-10");
  }),
}));

export function resetMaterialStorage() {
  storage.objects.clear();
  storage.reads.length = 0;
  storage.deleted.length = 0;
  storage.tokens.length = 0;
  storage.failDelete = false;
  storage.beforeRead = undefined;
}

export const materialStorage = storage;
