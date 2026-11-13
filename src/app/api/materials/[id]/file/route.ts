import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { getMaterialFile } from "@/features/materials/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * `filename` is an ASCII-only fallback (quotes, backslashes and non-ASCII
 * replaced); `filename*` carries the real name, percent-encoded (RFC 6266).
 * Control characters can't occur: the create schema rejects them.
 */
function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Owner-only download, streamed from the private Blob store. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const file = await getMaterialFile(user, id);
    return new Response(file.stream, {
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.size),
        "content-disposition": contentDisposition(file.originalName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
