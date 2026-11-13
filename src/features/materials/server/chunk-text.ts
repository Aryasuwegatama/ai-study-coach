/**
 * Pipeline A step 4 (PRD Section 3): pack natural units (pages, slides,
 * paragraphs) in order into chunks of about 1,500 characters, at most
 * 2,500, with no overlap. Small units combine ("Slides 12–14"); a unit
 * longer than 2,500 is split at sentence boundaries.
 */
export type TextUnit = { page: number; text: string };
export type ChunkDraft = { content: string; pageStart: number; pageEnd: number };

export const CHUNK_TARGET_CHARS = 1500;
export const CHUNK_MIN_CHARS = 300;
export const CHUNK_MAX_CHARS = 2500;

const SEPARATOR = "\n\n";

/** Splits text longer than the maximum into sentence-packed pieces of at most the maximum. */
function splitLong(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).flatMap((s) => {
    // A "sentence" with no boundary in 2,500 characters gets a hard cut.
    const cuts: string[] = [];
    for (let i = 0; i < s.length; i += CHUNK_MAX_CHARS) cuts.push(s.slice(i, i + CHUNK_MAX_CHARS));
    return cuts;
  });
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current.length >= CHUNK_TARGET_CHARS || current.length + 1 + sentence.length > CHUNK_MAX_CHARS)) {
      pieces.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) pieces.push(current);
  return pieces;
}

export function packChunks(units: TextUnit[]): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let current: ChunkDraft | null = null;

  for (const unit of units) {
    for (const piece of splitLong(unit.text)) {
      if (
        current &&
        (current.content.length >= CHUNK_TARGET_CHARS ||
          current.content.length + SEPARATOR.length + piece.length > CHUNK_MAX_CHARS)
      ) {
        chunks.push(current);
        current = null;
      }
      current = current
        ? { content: current.content + SEPARATOR + piece, pageStart: current.pageStart, pageEnd: unit.page }
        : { content: piece, pageStart: unit.page, pageEnd: unit.page };
    }
  }
  if (current) chunks.push(current);

  // A short last chunk joins the one before it when that still fits.
  // ponytail: only the last one; a short chunk in the middle (a small unit
  // followed by one too big to share with) stays short.
  const last = chunks.at(-1);
  const prev = chunks.at(-2);
  if (
    last &&
    prev &&
    last.content.length < CHUNK_MIN_CHARS &&
    prev.content.length + SEPARATOR.length + last.content.length <= CHUNK_MAX_CHARS
  ) {
    chunks.splice(-2, 2, {
      content: prev.content + SEPARATOR + last.content,
      pageStart: prev.pageStart,
      pageEnd: last.pageEnd,
    });
  }
  return chunks;
}
