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
  /** Unchanged from `requireSpace()`. */
  SPACE_NOT_FOUND: { status: 404, message: "Study space not found." },
} as const satisfies Record<string, { status: number; message: string }>;

export type MaterialApiErrorCode = keyof typeof MATERIAL_API_ERRORS;

/** Stored on a `failed` row and shown next to Retry. */
export const MATERIAL_FAILURE_REASONS = {
  NO_READABLE_TEXT: "No readable text found (scanned pages are not supported)", // †
  TOO_MANY_PAGES: "File too long (maximum 200 pages)", // †
  TOO_MUCH_TEXT: "Too much text. Split the file into smaller parts.", // †
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
      .max(255, "Use a file name of 255 characters or fewer."),
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
