import { z } from "zod";

/**
 * Write flashcards from labelled sources (PRD Section 3, Pipeline C), and
 * the separate support check. Bump a version when its prompt changes.
 *
 * The model's answer is only checked for shape here; the limits (front 120
 * characters, back 200, model answer 600, 2–4 key points) are code checks
 * applied to each card (`cardProblem`), so one overlong card is dropped
 * instead of making the whole answer unusable.
 */
export const PROMPT_VERSION = "cards-v1";
export const CHECK_PROMPT_VERSION = "card-check-v1";

export const RECALL_FRONT_MAX = 120;
export const RECALL_BACK_MAX = 200;
export const SHORT_QUESTION_MAX = 500;
export const SHORT_ANSWER_MAX = 600;
export const KEY_POINT_MAX = 200;

export const writtenCardsSchema = z.object({
  cards: z.array(
    z.object({
      kind: z.enum(["recall", "short_answer"]),
      /** Recall: the prompt on the front. Short answer: the question. */
      front: z.string(),
      /** Recall: the short answer. Short answer: the model answer. */
      back: z.string(),
      /** Short answer: 2–4 key points. Recall: empty. */
      keyPoints: z.array(z.string()),
      topic: z.string(),
      sources: z.array(z.string()),
    }),
  ),
});
export type WrittenCard = z.infer<typeof writtenCardsSchema>["cards"][number];

const text = (max: number) => z.string().trim().min(1).max(max);
export const recallCardSchema = z.object({
  kind: z.literal("recall"),
  front: text(RECALL_FRONT_MAX),
  back: text(RECALL_BACK_MAX),
  keyPoints: z.array(z.string()).length(0),
});
export const shortAnswerCardSchema = z.object({
  kind: z.literal("short_answer"),
  front: text(SHORT_QUESTION_MAX),
  back: text(SHORT_ANSWER_MAX),
  keyPoints: z.array(text(KEY_POINT_MAX)).min(2).max(4),
});

/** The card-level code check (shape, lengths, key points); null when it passes. */
export function cardProblem(card: WrittenCard): string | null {
  const parsed = (card.kind === "recall" ? recallCardSchema : shortAnswerCardSchema).safeParse(card);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return `${card.kind} card shape (${issue.path.join(".") || "card"}: ${issue.message})`;
}

export const WRITE_SYSTEM = `You write flashcards for a student, using only the sources given.
For each topic, write exactly the number of recall cards and of short-answer cards asked. Every card has:
- kind: "recall" or "short_answer";
- topic: the topic label, such as "T1";
- sources: the labels of the sources that support the back, such as ["S2"].
A recall card is a short prompt and a short answer:
- front: a prompt of at most 120 characters (a term, a question or a fill-in);
- back: the answer in at most 200 characters;
- keyPoints: an empty list.
A short-answer card is a question the student answers by typing, then compares with a model answer:
- front: one clear question;
- back: the model answer, at most 600 characters;
- keyPoints: 2 to 4 short key points the answer should contain.
Use only topic and source labels from the lists. Don't repeat a card.`;

export type LabelledSource = { label: string; pages: string; content: string };
export type LabelledCardTopic = {
  label: string;
  name: string;
  description: string;
  recall: number;
  short: number;
  sourceLabels: string[];
};

export function buildWritePrompt(topics: LabelledCardTopic[], sources: LabelledSource[], avoid: string[]): string {
  const sourceText = sources.map((s) => `<source id="${s.label}" pages="${s.pages}">\n${s.content}\n</source>`).join("\n");
  const topicText = topics
    .map(
      (t) =>
        `${t.label}: ${t.name} — ${t.description} (write ${t.recall} recall and ${t.short} short-answer cards; its sources: ${t.sourceLabels.join(", ")})`,
    )
    .join("\n");
  const avoidText = avoid.length ? `\n\nDon't repeat these existing cards:\n${avoid.map((q) => `- ${q}`).join("\n")}` : "";
  return `Sources:\n${sourceText}\n\nTopics:\n${topicText}${avoidText}`;
}

export const cardCheckSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      supported: z.boolean(),
      reason: z.string().max(300),
    }),
  ),
});

export const CHECK_SYSTEM = `You check flashcards against their sources.
For each card, answer one thing: is the back (or the model answer) supported by the sources (supported)?
Give a short reason. Return one result per card id.`;

export type CheckCandidate = { id: string; kind: "recall" | "short_answer"; front: string; back: string; sources: LabelledSource[] };

export function buildCheckPrompt(candidates: CheckCandidate[]): string {
  return candidates
    .map((c) => {
      const sources = c.sources.map((s) => `<source id="${s.label}" pages="${s.pages}">\n${s.content}\n</source>`).join("\n");
      return `<card id="${c.id}" kind="${c.kind}">\nFront: ${c.front}\n${c.kind === "recall" ? "Back" : "Model answer"}: ${c.back}\n${sources}\n</card>`;
    })
    .join("\n\n");
}

/** Fake provider: valid, distinct cards from each topic's sources. */
export function fakeCards(topics: LabelledCardTopic[], sources: LabelledSource[], salt: number): { cards: WrittenCard[] } {
  const byLabel = new Map(sources.map((s) => [s.label, s]));
  const words = (t: LabelledCardTopic, i: number) =>
    (byLabel.get(t.sourceLabels[i % t.sourceLabels.length])?.content ?? t.name).split(/\s+/).slice(0, 4).join(" ");
  return {
    cards: topics.flatMap((t) => [
      ...Array.from({ length: t.recall }, (_, i): WrittenCard => {
        const w = words(t, i);
        return {
          kind: "recall",
          front: `Card ${salt}-r${i + 1} on ${t.name}: what is "${w}"?`.slice(0, RECALL_FRONT_MAX),
          back: `${w}.`,
          keyPoints: [],
          topic: t.label,
          sources: t.sourceLabels.length ? [t.sourceLabels[i % t.sourceLabels.length]] : [],
        };
      }),
      ...Array.from({ length: t.short }, (_, i): WrittenCard => {
        const w = words(t, i + t.recall);
        return {
          kind: "short_answer",
          front: `Card ${salt}-s${i + 1} on ${t.name}: explain "${w}".`,
          back: `The source says: ${w}.`,
          keyPoints: [`Mentions ${w}`, `Relates it to ${t.name}`],
          topic: t.label,
          sources: t.sourceLabels.length ? [t.sourceLabels[(i + t.recall) % t.sourceLabels.length]] : [],
        };
      }),
    ]),
  };
}

/**
 * Check scripts only: replace what the fake provider writes or how its
 * support check answers, to exercise the rejection paths. Never set in the app.
 */
let fakeWriterOverride: ((topics: LabelledCardTopic[], sources: LabelledSource[], salt: number) => { cards: WrittenCard[] }) | undefined;
let fakeCheckOverride: ((candidates: CheckCandidate[]) => z.infer<typeof cardCheckSchema>) | undefined;
export function setFakeCardsForChecks(writer: typeof fakeWriterOverride, check?: typeof fakeCheckOverride): void {
  fakeWriterOverride = writer;
  fakeCheckOverride = check;
}
export const fakeCardsOrOverride = (topics: LabelledCardTopic[], sources: LabelledSource[], salt: number) =>
  (fakeWriterOverride ?? fakeCards)(topics, sources, salt);
export const fakeCheckOrOverride = (candidates: CheckCandidate[]): z.infer<typeof cardCheckSchema> =>
  fakeCheckOverride
    ? fakeCheckOverride(candidates)
    : { results: candidates.map((c) => ({ id: c.id, supported: true, reason: "ok" })) };
