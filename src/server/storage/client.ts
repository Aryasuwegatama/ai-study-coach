import { put, del, head, type PutBlobResult } from "@vercel/blob";
import { serverEnv } from "@/lib/env";

/**
 * Thin Private Blob adapter. Features never call `@vercel/blob` directly
 * (PRD Section 4, "adapters" rule); they go through these functions, which
 * the upload flow (T-06b) builds on.
 *
 * `access: "private"` requires authentication to read the blob's URL; the
 * app enforces that with an owner-checked download route rather than the
 * object being guessable (Security rule 6).
 */
function token(): string {
  return serverEnv().BLOB_READ_WRITE_TOKEN;
}

export async function putPrivateBlob(
  pathname: string,
  body: Parameters<typeof put>[1],
  contentType?: string,
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: "private",
    token: token(),
    ...(contentType ? { contentType } : {}),
  });
}

export async function deleteBlob(urlOrPathname: string | string[]): Promise<void> {
  await del(urlOrPathname, { token: token() });
}

export async function blobExists(urlOrPathname: string): Promise<boolean> {
  try {
    await head(urlOrPathname, { token: token() });
    return true;
  } catch {
    return false;
  }
}
