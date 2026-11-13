import { z } from "zod";

/**
 * Topic suggestions for one material (PRD Section 3, Pipeline A steps 6–7).
 * Changing the prompt means bumping the version.
 */
export const PROMPT_VERSION = "topics-v1";

export const MIN_TOPICS = 3;
export const MAX_TOPICS = 12;

export const topicSuggestionsSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        description: z.string().min(1).max(200),
        pages: z.array(z.number().int()).min(1),
      }),
    )
    .min(MIN_TOPICS)
    .max(MAX_TOPICS),
});
export type TopicSuggestions = z.infer<typeof topicSuggestionsSchema>;

export const SYSTEM = `You find the main study topics in a student's course material.
Return between ${MIN_TOPICS} and ${MAX_TOPICS} topics. Each topic has:
- name: a short topic name (60 characters or fewer), not a sentence;
- description: one line saying what the topic covers;
- pages: the page, slide or section numbers where the topic is taught, taken from the source tags.
Topics must be distinct; don't repeat a topic under another name.`;

export type SourcePiece = { pageStart: number; pageEnd: number; content: string };

/** Sources in order, each marked with its pages. */
export function buildPrompt(pieces: SourcePiece[]): string {
  const sources = pieces
    .map((p) => `<source pages="${p.pageStart === p.pageEnd ? p.pageStart : `${p.pageStart}-${p.pageEnd}`}">\n${p.content}\n</source>`)
    .join("\n");
  return `Course material:\n${sources}\n\nList the study topics.`;
}

/**
 * Rough token estimate (about 4 characters per token). The 240,000-character
 * upload cap is about 60,000 tokens, far inside the Flash model's context,
 * so one request always fits today.
 * ponytail: page-preserving batches plus consolidation (PRD step 6) only
 * if a smaller-context model is configured; this guard fails loudly first.
 */
export const TOPIC_INPUT_TOKEN_BUDGET = 200_000;
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function normalizeTopicName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/** Code checks after the schema: real page numbers and no duplicate names. */
export function checkSuggestions(value: TopicSuggestions, pageCount: number): string | null {
  const names = new Set<string>();
  for (const topic of value.topics) {
    const key = normalizeTopicName(topic.name);
    if (names.has(key)) return "duplicate topic name";
    names.add(key);
    if (topic.pages.some((p) => p < 1 || p > pageCount)) return "page out of range";
  }
  return null;
}

/** Fake provider: one topic per early page, named after its first words. */
export function fakeSuggestions(pieces: SourcePiece[]): TopicSuggestions {
  const topics = Array.from({ length: MIN_TOPICS }, (_, i) => {
    const piece = pieces[i % pieces.length];
    const words = piece.content.split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || "Topic";
    return {
      name: `${words.slice(0, 50)} ${i + 1}`,
      description: `Covers ${words.slice(0, 60)}.`,
      pages: [piece.pageStart],
    };
  });
  return { topics };
}
