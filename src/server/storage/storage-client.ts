import { put, del, get, head, type GetBlobResult, type PutBlobResult } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { serverEnv } from "@/lib/server-env";

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

/**
 * A token the browser uses for ONE `put()` from `@vercel/blob/client`
 * (T-06b): only this exact pathname, only these MIME types, at most
 * `maxBytes`, never overwriting, and only until `validUntil` (ms epoch).
 */
export async function createUploadToken(options: {
  pathname: string;
  allowedContentTypes: string[];
  maxBytes: number;
  validUntil: number;
}): Promise<string> {
  return generateClientTokenFromReadWriteToken({
    token: token(),
    pathname: options.pathname,
    allowedContentTypes: options.allowedContentTypes,
    maximumSizeInBytes: options.maxBytes,
    validUntil: options.validUntil,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

/** Reads a private blob; `null` when nothing is stored at that pathname. */
export async function getPrivateBlob(
  pathname: string,
): Promise<Extract<GetBlobResult, { statusCode: 200 }> | null> {
  const result = await get(pathname, { access: "private", token: token() });
  return result && result.statusCode === 200 ? result : null;
}

/** Deleting a pathname that holds nothing succeeds, so a retry is safe. */
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
