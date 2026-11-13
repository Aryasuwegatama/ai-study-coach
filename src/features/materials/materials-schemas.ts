import { z } from "zod";

/**
 * T-06a: the Materials API contract. Limits, accepted types, statuses,
 * stable error codes and messages, request schemas and response types for
 * every Materials route (PRD Section 4). No route handlers, tables or Blob
 * calls live here — T-06b implements them against this file.
 *
 * Imports only `zod` so pure scripts (`check-materials-contract.ts`) and
 * client components can both import it. Route handlers throw
 * `new ApiError(code, MATERIAL_API_ERRORS[code].message, MATERIAL_API_ERRORS[code].status)`
 * from `@/lib/api-errors`.
 */

// ---------------------------------------------------------------------------
// Limits (PRD Section 2). 1 MB = 1,000,000 bytes (proposal SR-03).
// ---------------------------------------------------------------------------

export const MAX_MATERIAL_BYTES = 10_000_000;
export const MAX_MATERIALS_PER_SPACE = 20;
export const MAX_MATERIAL_PAGES = 200;
export const MAX_MATERIAL_CHARS = 240_000;
export const MATERIAL_POLL_INTERVAL_MS = 3000;
/**
 * How long a browser upload token works (T-06b). 10 MB takes about 80 s at
 * 1 Mbit/s, so 5 minutes covers a slow connection, and a cancelled upload
 * can't land much later.
 */
export const MATERIAL_UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

export const ACCEPTED_FILE_TYPES = [
  { extension: ".pdf", mimeType: "application/pdf", label: "PDF" },
  {
    extension: ".pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PPTX",
  },
  { extension: ".txt", mimeType: "text/plain", label: "TXT" },
] as const;

export type AcceptedFileType = (typeof ACCEPTED_FILE_TYPES)[number];

// ---------------------------------------------------------------------------
// Statuses and the `process_material` stages (PRD Section 4).
// ---------------------------------------------------------------------------

export const MATERIAL_STATUSES = ["uploading", "processing", "review_topics", "ready", "failed"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MATERIAL_STAGES = ["verify", "extract", "embed", "suggest_topics"] as const;
export type MaterialStage = (typeof MATERIAL_STAGES)[number];

// ---------------------------------------------------------------------------
// Stable error codes. Messages marked † are PRD Section 2 text and must stay
// exact; the rest are T-06a wording, pending Arya's confirmation.
// ---------------------------------------------------------------------------

export const MATERIAL_API_ERRORS = {
  /** Generic fallback; real validation messages are per field. */
  VALIDATION_ERROR: { status: 400, message: "Check the file details and try again." },
  UNSUPPORTED_FILE_TYPE: { status: 400, message: "Only PDF, PPTX and TXT files can be uploaded." },
  FILE_TOO_LARGE: { status: 400, message: "File too large (maximum 10 MB)." },
  MATERIAL_LIMIT_REACHED: {
    status: 409,
    message: "This space already has 20 materials. Delete one to upload another.",
  },
  DUPLICATE_FILE: { status: 409, message: "This file is already in this space" }, // †
  UPLOAD_INCOMPLETE: { status: 409, message: "The upload hasn't finished yet." },
  INVALID_MATERIAL_STATE: { status: 409, message: "This material can't do that right now." },
  MATERIAL_NOT_FOUND: { status: 404, message: "Material not found." },
  /** T-06b: the Blob delete failed and nothing changed, so a retry finishes the job. */
  MATERIAL_DELETE_FAILED: { status: 503, message: "Couldn't delete this file. Try again." },
  /** T-06b: the row exists but its file is gone (an interrupted delete). Deleting again fixes it. */
  FILE_UNAVAILABLE: { status: 404, message: "This file is no longer available." },
  /** Unchanged from `requireSpace()`. */
  SPACE_NOT_FOUND: { status: 404, message: "Study space not found." },
} as const satisfies Record<string, { status: number; message: string }>;

export type MaterialApiErrorCode = keyof typeof MATERIAL_API_ERRORS;

/** Stored on a `failed` row and shown next to Retry. */
export const MATERIAL_FAILURE_REASONS = {
  NO_READABLE_TEXT: "No readable text found (scanned pages are not supported)", // †
  TOO_MANY_PAGES: "File too long (maximum 200 pages)", // †
  TOO_MUCH_TEXT: "Too much text. Split the file into smaller parts.", // †
  AI_UNUSABLE_ANSWER: "The AI returned an unusable answer; please try again", // † PRD 03
  PROCESSING_FAILED: "Processing failed. Try again.",
} as const;

export type MaterialFailureCode = keyof typeof MATERIAL_FAILURE_REASONS;

// ---------------------------------------------------------------------------
// Request schemas. Plain `z.object` (not `.strict()`), as in
// `spaces-schemas.ts`: a stray `ownerId`, `userId`, `spaceId` or `role` is
// stripped, never trusted (Security rule 1) — identity and the space come
// only from the session and the URL.
//
// `complete`, `retry`, `file` and `DELETE` take no body; any body sent is
// ignored, so they have no schema.
// ---------------------------------------------------------------------------

function fileTypeForName(name: string): AcceptedFileType | undefined {
  const lower = name.toLowerCase();
  return ACCEPTED_FILE_TYPES.find((t) => lower.endsWith(t.extension));
}

function issue(ctx: z.RefinementCtx, errorCode: MaterialApiErrorCode, path: string) {
  ctx.addIssue({
    code: "custom",
    message: MATERIAL_API_ERRORS[errorCode].message,
    path: [path],
    params: { errorCode },
  });
}

/**
 * Body of `POST /api/spaces/:spaceId/materials`.
 * - `name`: trimmed, 1–255 characters, ends in `.pdf`, `.pptx` or `.txt`
 *   (case-insensitive), else `UNSUPPORTED_FILE_TYPE`. 255 is the common
 *   filesystem limit; the PRD gives none (pending Arya).
 * - `size`: an integer byte count. 0 or less is "This file is empty."
 *   (`VALIDATION_ERROR`); over `MAX_MATERIAL_BYTES` is `FILE_TOO_LARGE`.
 * - `contentType`: the browser's MIME type. `""` is allowed (some browsers
 *   report nothing for `.pptx`); otherwise it must match the extension.
 *   The real type is checked from the file's first bytes at "complete".
 */
export const createMaterialSchema = z
  .object({
    name: z
      .string({ error: "Enter a file name." })
      .trim()
      .min(1, "Enter a file name.")
      .max(255, "Use a file name of 255 characters or fewer.")
      // No control characters: a NUL breaks the Postgres insert, CR/LF would
      // reach the download's Content-Disposition header.
      .regex(/^[^\u0000-\u001f\u007f]*$/, "Remove special characters from the file name."),
    size: z
      .number({ error: "Enter the file size." })
      .int("Enter the file size in whole bytes.")
      .positive("This file is empty."),
    contentType: z.string({ error: "Enter the file type." }),
  })
  .superRefine((body, ctx) => {
    const fileType = fileTypeForName(body.name);
    if (!fileType || (body.contentType !== "" && body.contentType !== fileType.mimeType)) {
      issue(ctx, "UNSUPPORTED_FILE_TYPE", fileType ? "contentType" : "name");
    }
    if (body.size > MAX_MATERIAL_BYTES) {
      issue(ctx, "FILE_TOO_LARGE", "size");
    }
  });

export type CreateMaterialRequest = z.infer<typeof createMaterialSchema>;

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: MaterialApiErrorCode; message: string } };

/**
 * Parses a create body and returns the first issue as a stable code and
 * message, so a route responds in one line:
 * `if (!parsed.success) return errorResponse(parsed.error.code, parsed.error.message, MATERIAL_API_ERRORS[parsed.error.code].status)`.
 */
export function parseCreateMaterialRequest(body: unknown): ParseResult<CreateMaterialRequest> {
  const result = createMaterialSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const first = result.error.issues[0];
  const params = first && "params" in first ? (first.params as { errorCode?: MaterialApiErrorCode }) : undefined;
  return {
    success: false,
    error: {
      code: params?.errorCode ?? "VALIDATION_ERROR",
      message: first?.message ?? MATERIAL_API_ERRORS.VALIDATION_ERROR.message,
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same check as `isValidSpaceId` (copied: `src/server/auth/**` is frozen
 * for T-06a). Postgres throws on a malformed UUID, so `requireMaterial`
 * checks this first and answers 404 `MATERIAL_NOT_FOUND`, never 500.
 */
export function isValidMaterialId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

// ---------------------------------------------------------------------------
// Response types. Never `blobPath`/`blob_path`, `fileHash`/`file_hash`,
// `ownerId` or `deletedAt` (Security rule 6); `check-materials-contract.ts`
// enforces this at compile time.
// ---------------------------------------------------------------------------

export type MaterialResponse = {
  id: string;
  originalName: string;
  status: MaterialStatus;
  stage: MaterialStage | null;
  /** "120 of 300 sections"; null until known. */
  progress: { done: number; total: number } | null;
  /** Only when `status === "failed"`. */
  error: { code: MaterialFailureCode; message: string } | null;
  /** Null until the job's verify step. */
  pageCount: number | null;
  /** The real size measured at "complete" (T-06b); null while uploading. */
  sizeBytes: number | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
};

/** `GET /api/spaces/:spaceId/materials` — 200, newest first. */
export type ListMaterialsResponse = { materials: MaterialResponse[] };

/** `POST /api/spaces/:spaceId/materials` — 201, material in `uploading`. */
export type CreateMaterialResponse = {
  material: MaterialResponse;
  /** Used once by the browser's `put()`. */
  upload: { pathname: string; clientToken: string };
};

/** `POST /api/materials/:id/complete` — 200. */
export type CompleteMaterialResponse = { material: MaterialResponse };

/** `POST /api/materials/:id/retry` — 202, material back in `processing`. */
export type RetryMaterialResponse = { material: MaterialResponse };

// `GET /api/materials/:id/file`: the file stream with
//   `Content-Disposition: attachment` and `originalName`; no JSON body.
// `DELETE /api/materials/:id`: 204, no body.

/*
 * Contract rules T-06b and T-09 build against.
 *
 * Upload flow (Security rule 6 — the file never passes through our server):
 *   1. `POST /api/spaces/:spaceId/materials` checks the body
 *      (`parseCreateMaterialRequest`), calls `requireSpace`, enforces
 *      `MAX_MATERIALS_PER_SPACE` (`MATERIAL_LIMIT_REACHED`; counts every
 *      non-deleted material in the space, whatever its status), creates the
 *      row as `uploading` and returns a client token limited to that ONE
 *      server-generated pathname (never built from `name`; it ends in the
 *      accepted extension), the three `ACCEPTED_FILE_TYPES` MIME types and
 *      `MAX_MATERIAL_BYTES`, with `allowOverwrite: false`. The pathname is
 *      the blob path, shown only to its uploader for this one `put()`. The
 *      token stops working after `MATERIAL_UPLOAD_TOKEN_TTL_MS`.
 *   2. The browser calls `put(pathname, file, { access: "private", token,
 *      contentType, onUploadProgress, abortSignal })` from
 *      `@vercel/blob/client`, where `contentType` is the extension's
 *      `ACCEPTED_FILE_TYPES` MIME type (never `file.type`, which can be `""`).
 *   3. The browser calls `POST /api/materials/:id/complete`.
 *
 * Complete:
 *   - Synchronously checks the real type from the first bytes, the size
 *     (≤ `MAX_MATERIAL_BYTES`), the SHA-256 fingerprint and the duplicate
 *     check. On failure the file is deleted from Blob, then the row, and the
 *     route returns `DUPLICATE_FILE` 409,
 *     `UNSUPPORTED_FILE_TYPE` 400 or `FILE_TOO_LARGE` 400. The row drops out
 *     of the list; the UI shows the message on that upload row.
 *   - No blob at the pathname yet: 409 `UPLOAD_INCOMPLETE`; the row stays
 *     `uploading`.
 *   - Idempotent: once the material has left `uploading`, calling it again
 *     returns 200 with the current material (a network retry never errors).
 *   - On success the material is `processing` at stage `extract` and its
 *     `process_material` job is queued (T-08a). If the job can't be
 *     queued with QStash, the response already shows `failed` with
 *     `PROCESSING_FAILED`, so the UI offers Retry.
 *   - Page count (`MAX_MATERIAL_PAGES`), readable text and
 *     `MAX_MATERIAL_CHARS` are checked later by the `process_material` job
 *     and end as `failed` with a `MATERIAL_FAILURE_REASONS` reason.
 *
 * Cancel: the browser aborts its `put()` (`abortSignal`), then calls
 *   `DELETE /api/materials/:id` — the same route and 204 as a normal
 *   delete, allowed in any status. The token's short expiry means a
 *   cancelled upload can't land later. Abandoned `uploading` rows are
 *   removed by the daily cron after 1 hour (PRD Section 4).
 *
 * Retry: only from `failed`; 202 with the material back in `processing`,
 *   at the stage that failed (earlier progress is kept). If the job can't
 *   be queued, the response shows `failed` again. Any other status: 409
 *   `INVALID_MATERIAL_STATE`.
 *
 * Download: owner-checked through `requireMaterial`. While `uploading`:
 *   409 `INVALID_MATERIAL_STATE`. Row present but file gone: 404
 *   `FILE_UNAVAILABLE`.
 *
 * Delete (Arya, 2026-11-13; a hard delete, materials have no
 *   `deleted_at`): in one request, delete the Blob file first, then the
 *   row. A file that's already gone counts as deleted, so retrying is safe.
 *   If the Blob delete fails, nothing changes and the route returns 503
 *   `MATERIAL_DELETE_FAILED`; otherwise 204. A file can never be left in
 *   Blob with no row pointing to it.
 *
 * Polling: the screen polls `GET` every `MATERIAL_POLL_INTERVAL_MS` while
 *   any material is `uploading` or `processing`.
 *
 * Ownership — `requireMaterial(materialId: string, user: SessionUser):
 * Promise<MaterialRecord>` (T-06b implements it in
 * `src/features/materials/server/`, not in `src/server/auth/**`):
 *   - Checks `isValidMaterialId` first.
 *   - Then ONE query joins `materials` to `study_spaces` on `space_id`,
 *     where `materials.id = $id`, `study_spaces.owner_id = user.id` and
 *     `study_spaces.deleted_at IS NULL`.
 *   - Missing, malformed, deleted, someone else's and deleted-space
 *     materials ALL throw the identical
 *     `ApiError("MATERIAL_NOT_FOUND", "Material not found.", 404)`,
 *     mirroring `requireSpace()`.
 *   - `MaterialRecord` carries `spaceId`, `status`, `blobPath` and
 *     `fileHash` for server use only and is never serialised.
 */
