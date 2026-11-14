import { ACCEPTED_FILE_TYPES } from "./materials-schemas";

/** "2.4 MB" — 1 MB = 1,000,000 bytes, the contract's own definition. */
export function formatMaterialSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${roundTo1(bytes / 1_000)} KB`;
  return `${roundTo1(bytes / 1_000_000)} MB`;
}

function roundTo1(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** "PDF" / "PPTX" / "TXT" for the library's Type column. */
export function fileTypeLabel(originalName: string): string {
  const lower = originalName.toLowerCase();
  const match = ACCEPTED_FILE_TYPES.find((type) => lower.endsWith(type.extension));
  return match?.label ?? "File";
}
