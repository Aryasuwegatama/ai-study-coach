import { beforeEach, describe, expect, it, vi } from "vitest";

const { mint } = vi.hoisted(() => ({
  mint: vi.fn(async () => "synthetic-capability"),
}));
vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: mint,
}));
vi.mock("@/lib/server-env", () => ({
  serverEnv: () => ({ BLOB_READ_WRITE_TOKEN: "synthetic-store-only" }),
}));
import { createUploadToken } from "@/server/storage/storage-client";

describe("T-10 storage capability adapter", () => {
  beforeEach(() => {
    mint.mockClear();
  });
  it("SEC-UPLOAD-02: maps app restrictions to the SDK's exact expiry/size/path and no-overwrite options", async () => {
    const validUntil = Date.now() + 300_000;
    await expect(
      createUploadToken({
        pathname: "materials/synthetic.txt",
        allowedContentTypes: ["text/plain"],
        maxBytes: 10_000_000,
        validUntil,
      }),
    ).resolves.toBe("synthetic-capability");
    expect(mint).toHaveBeenCalledExactlyOnceWith({
      token: "synthetic-store-only",
      pathname: "materials/synthetic.txt",
      allowedContentTypes: ["text/plain"],
      maximumSizeInBytes: 10_000_000,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });
});
