import { createHash } from "node:crypto";
import { ACCEPTED_FILE_TYPES, MAX_MATERIAL_BYTES, type MaterialApiErrorCode } from "../materials-schemas";

export type FileCheck = { ok: true; hash: string } | { ok: false; code: MaterialApiErrorCode };

const PDF_MAGIC = Buffer.from("%PDF-");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PPTX_MARKER = Buffer.from("ppt/presentation.xml");

/** The real type from the first bytes (PRD Section 3, Pipeline A step 1). */
function looksLike(extension: string, bytes: Buffer): boolean {
  switch (extension) {
    case ".pdf":
      return bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
    case ".pptx":
      // ponytail: looks for the entry name anywhere in the ZIP (local and
      // central-directory headers store names uncompressed) rather than
      // parsing the archive. T-08a's extractor opens it properly and fails
      // the material if it's not a real presentation.
      return bytes.subarray(0, 4).equals(ZIP_MAGIC) && bytes.includes(PPTX_MARKER);
    case ".txt":
      if (bytes.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * The synchronous "complete" checks: real type for the name's extension,
 * size and SHA-256 fingerprint. The duplicate check needs the database, so
 * the service does it.
 */
export function checkUploadedFile(originalName: string, bytes: Buffer): FileCheck {
  if (bytes.length > MAX_MATERIAL_BYTES) return { ok: false, code: "FILE_TOO_LARGE" };
  if (bytes.length === 0) return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };
  const lower = originalName.toLowerCase();
  const type = ACCEPTED_FILE_TYPES.find((t) => lower.endsWith(t.extension));
  if (!type || !looksLike(type.extension, bytes)) return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };
  return { ok: true, hash: createHash("sha256").update(bytes).digest("hex") };
}
