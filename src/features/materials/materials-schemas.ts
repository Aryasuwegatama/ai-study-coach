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
