import { z } from "zod";

/**
 * Write MCQs from labelled sources (PRD Section 3, Pipeline B step 3), and
 * the separate answer check (step 5). Bump a version when its prompt changes.
 */
export const PROMPT_VERSION = "quiz-v1";
export const CHECK_PROMPT_VERSION = "check-v1";

export const writtenQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1).max(500),
      options: z.array(z.string().min(1).max(300)).length(4),
      correctOption: z.number().int().min(0).max(3),
      explanation: z.string().min(1).max(800),
      topic: z.string(),
      sources: z.array(z.string()).min(1),
      difficulty: z.enum(["easy", "medium", "hard"]),
    }),
  ),
});
export type WrittenQuestion = z.infer<typeof writtenQuestionsSchema>["questions"][number];

export const WRITE_SYSTEM = `You write multiple-choice questions for a student, using only the sources given.
For each topic, write exactly the number of questions asked. Each question has:
- question: one clear question;
- options: four different answers, exactly one of them correct;
- correctOption: the index (0-3) of the correct option;
- explanation: why the correct option is right, from the sources;
- topic: the topic label, such as "T1";
- sources: the labels of the sources that support the answer, such as ["S2"];
- difficulty: easy, medium or hard.
Use only topic and source labels from the lists. Don't repeat a question.`;

export type LabelledSource = { label: string; pages: string; content: string };
export type LabelledTopic = { label: string; name: string; description: string; count: number; sourceLabels: string[] };

export function buildWritePrompt(topics: LabelledTopic[], sources: LabelledSource[], avoid: string[]): string {
  const sourceText = sources.map((s) => `<source id="${s.label}" pages="${s.pages}">\n${s.content}\n</source>`).join("\n");
  const topicText = topics
    .map((t) => `${t.label}: ${t.name} — ${t.description} (write ${t.count}; its sources: ${t.sourceLabels.join(", ")})`)
    .join("\n");
  const avoidText = avoid.length ? `\n\nDon't repeat these existing questions:\n${avoid.map((q) => `- ${q}`).join("\n")}` : "";
  return `Sources:\n${sourceText}\n\nTopics:\n${topicText}${avoidText}`;
}

export const answerCheckSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      supported: z.boolean(),
      exactlyOneCorrect: z.boolean(),
      reason: z.string().max(300),
    }),
  ),
});

export const CHECK_SYSTEM = `You check multiple-choice questions against their sources.
For each question, answer two things: is the marked correct option supported by the sources (supported),
and is exactly one option correct (exactlyOneCorrect)? Give a short reason. Return one result per question id.`;

export type CheckCandidate = { id: string; question: string; options: string[]; correctOption: number; sources: LabelledSource[] };

export function buildCheckPrompt(candidates: CheckCandidate[]): string {
  return candidates
    .map((c) => {
      const options = c.options.map((o, i) => `${i}. ${o}${i === c.correctOption ? "  (marked correct)" : ""}`).join("\n");
      const sources = c.sources.map((s) => `<source id="${s.label}" pages="${s.pages}">\n${s.content}\n</source>`).join("\n");
      return `<question id="${c.id}">\n${c.question}\n${options}\n${sources}\n</question>`;
    })
    .join("\n\n");
}

/** Fake provider: valid, distinct questions from each topic's first source. */
export function fakeQuestions(topics: LabelledTopic[], sources: LabelledSource[], salt: number): { questions: WrittenQuestion[] } {
  const byLabel = new Map(sources.map((s) => [s.label, s]));
  return {
    questions: topics.flatMap((t) =>
      Array.from({ length: t.count }, (_, i) => {
        const source = byLabel.get(t.sourceLabels[i % t.sourceLabels.length]);
        const words = (source?.content ?? t.name).split(/\s+/).slice(0, 6).join(" ");
        return {
          question: `Question ${salt}-${i + 1} about ${t.name}: which statement matches "${words}"?`,
          options: [`${words}`, `Not ${words}`, `Neither ${t.name} nor ${words}`, `Only part of ${words}`],
          correctOption: 0,
          explanation: `The source says: ${words}.`,
          topic: t.label,
          sources: source ? [source.label] : [],
          difficulty: "medium" as const,
        };
      }),
    ),
  };
}
