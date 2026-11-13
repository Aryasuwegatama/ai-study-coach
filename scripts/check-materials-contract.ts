#!/usr/bin/env tsx
/**
 * Verifies the T-06a Materials API contract (`materials-schemas.ts`):
 * limits, accepted types, statuses, exact messages and request parsing.
 * Pure — no database, no network, no env. The response-type checks are
 * compile-time and enforced by `tsc --noEmit`.
 *
 * Run with: pnpm run check:materials-contract
 */
import {
  ACCEPTED_FILE_TYPES,
  MATERIAL_API_ERRORS,
  MATERIAL_FAILURE_REASONS,
  MATERIAL_POLL_INTERVAL_MS,
  MATERIAL_STATUSES,
  MATERIAL_UPLOAD_TOKEN_TTL_MS,
  MAX_MATERIAL_BYTES,
  MAX_MATERIAL_CHARS,
  MAX_MATERIAL_PAGES,
  MAX_MATERIALS_PER_SPACE,
  isValidMaterialId,
  parseCreateMaterialRequest,
  type MaterialApiErrorCode,
  type MaterialResponse,
} from "../src/features/materials/materials-schemas";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];

function check(name: string, ok: boolean, message: string) {
  results.push({ name, ok, message });
}

// Limits, types, statuses and messages (Task 2).
check("10 MB limit", MAX_MATERIAL_BYTES === 10_000_000, `${MAX_MATERIAL_BYTES}`);
check("20 per space", MAX_MATERIALS_PER_SPACE === 20, "");
check("200 pages", MAX_MATERIAL_PAGES === 200, "");
check("240,000 characters", MAX_MATERIAL_CHARS === 240_000, "");
check("Poll every 3 s", MATERIAL_POLL_INTERVAL_MS === 3000, "");
check(
  "Accepted extensions",
  JSON.stringify(ACCEPTED_FILE_TYPES.map((t) => t.extension)) === '[".pdf",".pptx",".txt"]',
  "",
);
check(
  "Accepted MIME types",
  JSON.stringify(ACCEPTED_FILE_TYPES.map((t) => t.mimeType)) ===
    JSON.stringify([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ]),
  "",
);
check(
  "Statuses",
  JSON.stringify(MATERIAL_STATUSES) === '["uploading","processing","review_topics","ready","failed"]',
  "",
);
check(
  "Section 2 messages are exact",
  MATERIAL_FAILURE_REASONS.NO_READABLE_TEXT === "No readable text found (scanned pages are not supported)" &&
    MATERIAL_FAILURE_REASONS.TOO_MANY_PAGES === "File too long (maximum 200 pages)" &&
    MATERIAL_FAILURE_REASONS.TOO_MUCH_TEXT === "Too much text. Split the file into smaller parts." &&
    MATERIAL_API_ERRORS.DUPLICATE_FILE.message === "This file is already in this space",
  "",
);
check(
  "Not-found mirrors SPACE_NOT_FOUND",
  MATERIAL_API_ERRORS.MATERIAL_NOT_FOUND.status === 404 &&
    MATERIAL_API_ERRORS.SPACE_NOT_FOUND.message === "Study space not found.",
  "",
);
check(
  "T-06b: delete failure is a retryable 503",
  MATERIAL_API_ERRORS.MATERIAL_DELETE_FAILED.status === 503 &&
    MATERIAL_API_ERRORS.MATERIAL_DELETE_FAILED.message === "Couldn't delete this file. Try again.",
  "",
);
check(
  "T-06b: upload token expires within a few minutes",
  MATERIAL_UPLOAD_TOKEN_TTL_MS > 60_000 && MATERIAL_UPLOAD_TOKEN_TTL_MS <= 10 * 60_000,
  `${MATERIAL_UPLOAD_TOKEN_TTL_MS} ms`,
);

// Request parsing (Task 3).
function expectError(name: string, body: unknown, code: MaterialApiErrorCode) {
  const result = parseCreateMaterialRequest(body);
  check(
    name,
    !result.success && result.error.code === code,
    result.success ? "passed (expected failure)" : `${result.error.code}: ${result.error.message}`,
  );
}

const valid = { name: "Database Foundations.pdf", size: 2_400_000, contentType: "application/pdf" };
check("Valid upload request passes", parseCreateMaterialRequest(valid).success, "");
expectError("Wrong type (.docx)", { ...valid, name: "notes.docx", contentType: "" }, "UNSUPPORTED_FILE_TYPE");
expectError("11 MB fails", { ...valid, size: 11_000_000 }, "FILE_TOO_LARGE");
expectError("Empty name fails", { ...valid, name: "   " }, "VALIDATION_ERROR");
const stray = parseCreateMaterialRequest({ ...valid, ownerId: "x", spaceId: "y", role: "instructor" });
check(
  "Stray ownerId/spaceId/role stripped",
  stray.success && !("ownerId" in stray.data) && !("spaceId" in stray.data) && !("role" in stray.data),
  "",
);
check(
  "Name is trimmed",
  (() => {
    const r = parseCreateMaterialRequest({ ...valid, name: "  a.pdf  " });
    return r.success && r.data.name === "a.pdf";
  })(),
  "",
);
expectError("Missing fields fail cleanly", {}, "VALIDATION_ERROR");
expectError("Non-object body fails cleanly", "nope", "VALIDATION_ERROR");
expectError("Fractional size fails", { ...valid, size: 1.5 }, "VALIDATION_ERROR");
// Review Focus
check(
  "pptx with empty contentType passes",
  parseCreateMaterialRequest({ name: "w3.pptx", size: 1000, contentType: "" }).success,
  "",
);
check(
  "uppercase extension passes",
  parseCreateMaterialRequest({ name: "NOTES.PDF", size: 1000, contentType: "application/pdf" }).success,
  "",
);
check("Exactly 10,000,000 bytes passes", parseCreateMaterialRequest({ ...valid, size: 10_000_000 }).success, "");
expectError("10,000,001 bytes fails", { ...valid, size: 10_000_001 }, "FILE_TOO_LARGE");
expectError("Fake extension fails", { ...valid, name: "slides.pdf.exe", contentType: "" }, "UNSUPPORTED_FILE_TYPE");
expectError("No extension fails", { ...valid, name: "notes", contentType: "" }, "UNSUPPORTED_FILE_TYPE");
expectError("MIME mismatch fails", { ...valid, contentType: "text/plain" }, "UNSUPPORTED_FILE_TYPE");
expectError("Zero bytes fails", { ...valid, size: 0 }, "VALIDATION_ERROR");
check(
  "Zero bytes says the file is empty",
  (() => {
    const r = parseCreateMaterialRequest({ ...valid, size: 0 });
    return !r.success && r.error.message === "This file is empty.";
  })(),
  "",
);
expectError("256-character name fails", { ...valid, name: "a".repeat(252) + ".pdf" }, "VALIDATION_ERROR");
check(
  "255-character name passes",
  parseCreateMaterialRequest({ ...valid, name: "a".repeat(251) + ".pdf" }).success,
  "",
);
expectError("Control characters in name fail", { ...valid, name: "a\r\nb.pdf" }, "VALIDATION_ERROR");
expectError("NUL in name fails", { ...valid, name: "a\u0000.pdf" }, "VALIDATION_ERROR");
check(
  "AI unusable-answer message is exact (PRD 03)",
  (MATERIAL_FAILURE_REASONS as Record<string, string>).AI_UNUSABLE_ANSWER ===
    "The AI returned an unusable answer; please try again",
  "",
);
check("UUID material ID valid", isValidMaterialId("00000000-0000-4000-8000-000000000000"), "");
check("Malformed material ID invalid", !isValidMaterialId("not-a-uuid"), "");

// Response shape (Task 4). The first check is compile-time: adding any
// forbidden key to MaterialResponse makes `tsc --noEmit` fail here.
type Forbidden = "blobPath" | "blob_path" | "fileHash" | "file_hash" | "ownerId" | "deletedAt";
const noSecretFields: Extract<keyof MaterialResponse, Forbidden> extends never ? true : false = true;
check("MaterialResponse has no blobPath/fileHash/ownerId/deletedAt", noSecretFields, "");
const sample: MaterialResponse = {
  id: "00000000-0000-4000-8000-000000000000",
  originalName: "a.pdf",
  status: "processing",
  stage: "embed",
  progress: { done: 120, total: 300 },
  error: null,
  pageCount: 12,
  sizeBytes: 2_400_000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
check("Sample processing material type-checks with progress", sample.progress?.done === 120, "");

for (const result of results) {
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}${result.message ? `: ${result.message}` : ""}`);
}
if (results.some((r) => !r.ok)) {
  process.exitCode = 1;
}
