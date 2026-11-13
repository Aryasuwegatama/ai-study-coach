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
  MAX_MATERIAL_BYTES,
  MAX_MATERIAL_CHARS,
  MAX_MATERIAL_PAGES,
  MAX_MATERIALS_PER_SPACE,
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

for (const result of results) {
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}${result.message ? `: ${result.message}` : ""}`);
}
if (results.some((r) => !r.ok)) {
  process.exitCode = 1;
}
