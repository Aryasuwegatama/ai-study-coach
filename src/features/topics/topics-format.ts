import type { DraftTopicResponse } from "./topics-schemas";

/**
 * Mirrors `normalizeTopicName` in `src/server/ai/prompts/topics.ts`. Client
 * code can't import from `src/server/**`, so this copy is kept in sync by
 * hand (T-09c plan risk, "Name normalisation is copied in the client"); the
 * server always decides the real match, this is only for live labels.
 */
export function normalizeTopicNameClient(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * Orders a loaded draft for display (Arya, 2026-11-18): AI topics by their
 * first page (ties by name), then manual topics in the order they were
 * added — the order `GET .../topic-draft` already returns them in, since
 * the draft API itself returns no particular order.
 */
export function sortDraftTopics(items: DraftTopicResponse[]): DraftTopicResponse[] {
  const ai = items
    .filter((topic) => topic.origin === "ai")
    .sort((a, b) => {
      const pageA = a.pages[0] ?? Number.MAX_SAFE_INTEGER;
      const pageB = b.pages[0] ?? Number.MAX_SAFE_INTEGER;
      return pageA !== pageB ? pageA - pageB : a.name.localeCompare(b.name);
    });
  const manual = items.filter((topic) => topic.origin === "manual");
  return [...ai, ...manual];
}

/**
 * Where the AI found a topic, for the suggestion card: "Page 3" or "Pages
 * 2–3" (consecutive pages join into a range, others are listed: "Pages 1, 3").
 * `null` for a topic with no pages (a manual one).
 */
export function formatDraftPages(pages: number[]): string | null {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const ranges: [number, number][] = [];
  for (const page of sorted) {
    const last = ranges.at(-1);
    if (last && page === last[1] + 1) last[1] = page;
    else ranges.push([page, page]);
  }
  const text = ranges.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(", ");
  return `${sorted.length === 1 ? "Page" : "Pages"} ${text}`;
}
