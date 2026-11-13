import { unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import { MAX_MATERIAL_CHARS, MAX_MATERIAL_PAGES, type MaterialFailureCode } from "../materials-schemas";
import type { TextUnit } from "./chunk-text";

/**
 * Pipeline A steps 2 and 3 (PRD Section 3): text with its page, slide or
 * section number, cleaned. The file was already verified at "complete"
 * (type from its first bytes, size, fingerprint, duplicate), so this only
 * adds the page/slide count and the text checks.
 */

/** A failure the same file will always hit: the material fails, no retry. */
export class ExtractionError extends Error {
  constructor(readonly code: MaterialFailureCode) {
    super(code);
  }
}

export type ExtractedText = { pageCount: number; charCount: number; units: TextUnit[] };

export async function extractMaterialText(originalName: string, bytes: Buffer): Promise<ExtractedText> {
  const lower = originalName.toLowerCase();
  let pageCount: number;
  let units: TextUnit[];

  if (lower.endsWith(".pdf")) {
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch {
      throw new ExtractionError("PROCESSING_FAILED");
    }
    pageCount = pdf.numPages;
    if (pageCount > MAX_MATERIAL_PAGES) throw new ExtractionError("TOO_MANY_PAGES");
    const { text } = await extractText(pdf, { mergePages: false });
    units = dropRepeatedLines(text.map((t, i) => ({ page: i + 1, text: t })));
  } else if (lower.endsWith(".pptx")) {
    units = pptxSlides(bytes);
    pageCount = units.length;
    if (pageCount > MAX_MATERIAL_PAGES) throw new ExtractionError("TOO_MANY_PAGES");
  } else {
    // TXT: blank-line separated paragraphs, numbered as sections.
    units = bytes
      .toString("utf8")
      .split(/\r?\n\s*\r?\n/)
      .map((text, i) => ({ page: i + 1, text }));
    pageCount = units.length;
  }

  units = units.map((u) => ({ page: u.page, text: tidy(u.text) })).filter((u) => u.text.length > 0);
  const charCount = units.reduce((sum, u) => sum + u.text.length, 0);
  if (charCount === 0) throw new ExtractionError("NO_READABLE_TEXT");
  if (charCount > MAX_MATERIAL_CHARS) throw new ExtractionError("TOO_MUCH_TEXT");
  return { pageCount, charCount, units };
}

/** Joins words hyphenated across line breaks and tidies spacing. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Drops lines that repeat on more than half the pages: headers, footers
 * and page numbers. On short lines digits are ignored when comparing, so
 * "Page 3 of 40" matches "Page 4 of 40"; longer lines must match exactly,
 * so "Step 1 …" and "Step 2 …" sentences survive. Only for 3 or more
 * pages; with fewer, "repeats" says nothing.
 */
export function dropRepeatedLines(pages: TextUnit[]): TextUnit[] {
  if (pages.length < 3) return pages;
  const key = (line: string) => {
    const trimmed = line.trim().toLowerCase();
    // ponytail: 30 characters is a guess at "footer length"; tune with real PDFs in T-08b.
    return trimmed.length <= 30 ? trimmed.replace(/\d+/g, "#") : trimmed;
  };
  const seenOn = new Map<string, number>();
  for (const page of pages) {
    for (const k of new Set(page.text.split("\n").map(key))) {
      if (k) seenOn.set(k, (seenOn.get(k) ?? 0) + 1);
    }
  }
  return pages.map((page) => ({
    page: page.page,
    text: page.text
      .split("\n")
      .filter((line) => (seenOn.get(key(line)) ?? 0) <= pages.length / 2)
      .join("\n"),
  }));
}

// ---------------------------------------------------------------------------
// PPTX: a ZIP of XML parts. Only the parts needed are inflated, and their
// declared sizes are capped, so a ZIP bomb can't exhaust memory.
// ---------------------------------------------------------------------------

const MAX_PPTX_XML_BYTES = 50_000_000;

const PPTX_PART =
  /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/;

function pptxSlides(bytes: Buffer): TextUnit[] {
  let declared = 0;
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(new Uint8Array(bytes), {
      filter: (file) => {
        if (!PPTX_PART.test(file.name)) return false;
        declared += file.originalSize;
        if (declared > MAX_PPTX_XML_BYTES) throw new ExtractionError("TOO_MUCH_TEXT");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("PROCESSING_FAILED");
  }
  const read = (name: string) => (parts[name] ? new TextDecoder().decode(parts[name]) : "");

  // Slide order is the order of <p:sldId r:id="…"> in presentation.xml,
  // resolved through its relationships, not the file names.
  const rels = relationships(read("ppt/_rels/presentation.xml.rels"));
  const slidePaths = [...read("ppt/presentation.xml").matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => rels.get(m[1]))
    .filter((target): target is string => Boolean(target))
    .map((target) => resolvePath("ppt/", target));
  if (slidePaths.length === 0) throw new ExtractionError("PROCESSING_FAILED");
  if (slidePaths.length > MAX_MATERIAL_PAGES) throw new ExtractionError("TOO_MANY_PAGES");

  return slidePaths.map((slidePath, i) => {
    const dir = slidePath.slice(0, slidePath.lastIndexOf("/") + 1);
    const file = slidePath.slice(dir.length);
    const slideRels = relationships(read(`${dir}_rels/${file}.rels`));
    const notesTarget = [...slideRels.values()].find((t) => t.includes("notesSlide"));
    const notes = notesTarget ? xmlParagraphs(read(resolvePath(dir, notesTarget))) : "";
    const text = xmlParagraphs(read(slidePath));
    return { page: i + 1, text: notes ? `${text}\n\nNotes: ${notes}` : text };
  });
}

/** rId → Target, from a `.rels` part. */
function relationships(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Resolves a relative `Target` such as `../notesSlides/notesSlide1.xml`. */
function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

/** One line per `<a:p>`, joining its `<a:t>` runs. Slide-number placeholders are skipped. */
function xmlParagraphs(xml: string): string {
  return xml
    .replace(/<a:fld\b[^>]*type="slidenum"[^>]*>[\s\S]*?<\/a:fld>/g, "")
    .split(/<\/a:p>/)
    .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
    .filter((line) => line.trim())
    .join("\n");
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[lower]!;
  });
}
