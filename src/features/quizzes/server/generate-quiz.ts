import { randomInt } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { itemSources, learningItems, topics } from "@/server/db/schema";
import { type Job } from "@/server/jobs/job-claims";
import { callAI } from "@/server/ai/call-ai";
import * as quizPrompt from "@/server/ai/prompts/quiz";
import { MIN_PUBLISHED_QUESTIONS, normalizePrompt, stripOptionLabels } from "../quizzes-schemas";
import {
  commitGroup,
  failGeneration,
  labelSources,
  loadExisting,
  loadPublishedPrompts,
  publishSet,
  runGeneration,
  type Plan,
  type StudySet,
} from "./generation-shared";

/**
 * The `generate_quiz` job (T-11b; PRD Section 3, Pipeline B; Section 4,
 * "Background jobs"). Steps, each one bounded call or less:
 *
 * - `retrieve`: take a generation slot (at most two quiz/deck jobs hold
 *   one, under an advisory lock), then pick up to 8 chunks per topic from
 *   the chosen materials only and split topics into groups of at most 40
 *   sources. The plan (ids and counts only) goes in `jobs.payload`.
 * - `write:k`: one write call for group k, code checks, one answer-check
 *   call, and the passing questions saved on the still-`generating` set.
 * - `top_up:k`: the same for group k's shortfall only (one round).
 * - `publish`: at least 5 questions → `ready`; fewer → `failed`.
 *
 * `retrieve`, the slot admission, the step plumbing and the commit are shared
 * with the deck job (`generation-shared.ts`, T-18); this file keeps what is
 * specific to multiple-choice questions.
 */

function shuffledOptions(options: string[], correct: number): { options: string[]; correctIndex: number } {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((o) => options[o]), correctIndex: order.indexOf(correct) };
}

/** Code checks (PRD Section 3, Pipeline B step 4). */
function codeCheck(
  q: quizPrompt.WrittenQuestion,
  topicLabels: Set<string>,
  sourceLabels: Set<string>,
  seen: Set<string>,
): string | null {
  const opts = q.options.map((o) => o.trim().toLowerCase());
  if (opts.some((o) => !o) || new Set(opts).size !== 4) return "options not four distinct answers";
  if (!topicLabels.has(q.topic)) return "unknown topic label";
  if (!q.sources.length || q.sources.some((s) => !sourceLabels.has(s))) return "unknown source label";
  if (seen.has(normalizePrompt(q.question))) return "duplicate question";
  return null;
}

async function writeGroup(job: Job, set: StudySet, k: number, topUp: boolean): Promise<void> {
  const plan = job.payload as Plan;
  const group = plan.groups[k];
  const existing = await loadExisting(set.id);
  const need = new Map(group.topics.map((t) => [t.topicId, t.count - existing.filter((e) => e.topicId === t.topicId).length]));
  const wanted = group.topics.filter((t) => need.get(t.topicId)! > 0);

  const accepted: { q: quizPrompt.WrittenQuestion; topicId: string; chunkIds: string[] }[] = [];
  if (wanted.length) {
    const { sources, labelOf } = await labelSources(wanted);
    const topicRows = await db.select().from(topics).where(inArray(topics.id, wanted.map((t) => t.topicId)));
    const labelled: quizPrompt.LabelledTopic[] = wanted.map((t, i) => {
      const row = topicRows.find((r) => r.id === t.topicId)!;
      return {
        label: `T${i + 1}`,
        name: row.name,
        description: row.description,
        count: need.get(t.topicId)!,
        sourceLabels: t.chunkIds.map((id) => labelOf.get(id)).filter((l): l is string => Boolean(l)),
      };
    });

    // Not a duplicate of this quiz or of questions already published for these topics.
    const published = await loadPublishedPrompts(wanted.map((t) => t.topicId), ["mcq"]);
    const seen = new Set([...existing.map((e) => e.normalizedPrompt), ...published]);
    const avoid = existing.filter((e) => need.has(e.topicId)).map((e) => e.prompt).slice(0, 20);

    const written = await callAI({
      jobId: job.id,
      purpose: "write_questions",
      promptVersion: quizPrompt.PROMPT_VERSION,
      model: "generate",
      schema: quizPrompt.writtenQuestionsSchema,
      system: quizPrompt.WRITE_SYSTEM,
      prompt: quizPrompt.buildWritePrompt(labelled, sources, avoid),
      fake: () => quizPrompt.fakeQuestions(labelled, sources, topUp ? 2 : 1),
    });

    const topicLabels = new Map(labelled.map((t, i) => [t.label, wanted[i].topicId]));
    const sourceLabels = new Map(sources.map((s) => [s.label, s]));
    const left = new Map(need);
    const candidates: { q: quizPrompt.WrittenQuestion; topicId: string; chunkIds: string[] }[] = [];
    for (const raw of written.questions) {
      // Before the checks, so the answer check and the saved item both see clean option text.
      const q = { ...raw, options: stripOptionLabels(raw.options) };
      const problem = codeCheck(q, new Set(topicLabels.keys()), new Set(sourceLabels.keys()), seen);
      const topicId = topicLabels.get(q.topic);
      if (problem || !topicId) {
        console.info(`[generate_quiz] set ${set.id}: rejected by code check (${problem})`);
        continue;
      }
      if (left.get(topicId)! <= 0) continue;
      left.set(topicId, left.get(topicId)! - 1);
      seen.add(normalizePrompt(q.question));
      candidates.push({ q, topicId, chunkIds: q.sources.map((s) => sourceLabels.get(s)!.chunkId) });
    }

    if (candidates.length) {
      const checked = await callAI({
        jobId: job.id,
        purpose: "check_answers",
        promptVersion: quizPrompt.CHECK_PROMPT_VERSION,
        model: "check",
        schema: quizPrompt.answerCheckSchema,
        system: quizPrompt.CHECK_SYSTEM,
        prompt: quizPrompt.buildCheckPrompt(
          candidates.map((c, i) => ({
            id: `Q${i + 1}`,
            question: c.q.question,
            options: c.q.options,
            correctOption: c.q.correctOption,
            sources: c.q.sources.map((s) => sourceLabels.get(s)!),
          })),
        ),
        fake: () => ({ results: candidates.map((_, i) => ({ id: `Q${i + 1}`, supported: true, exactlyOneCorrect: true, reason: "ok" })) }),
      });
      const verdicts = new Map(checked.results.map((r) => [r.id, r]));
      candidates.forEach((c, i) => {
        const v = verdicts.get(`Q${i + 1}`);
        if (v?.supported && v.exactlyOneCorrect) accepted.push(c);
        else console.info(`[generate_quiz] set ${set.id}: rejected by answer check (${v?.reason ?? "no verdict"})`);
      });
    }
  }

  await commitGroup(job, set, plan, k, topUp, async (tx, firstPosition) => {
    for (const [i, c] of accepted.entries()) {
      const { options, correctIndex } = shuffledOptions(c.q.options, c.q.correctOption);
      const [item] = await tx
        .insert(learningItems)
        .values({
          setId: set.id,
          spaceId: set.spaceId,
          topicId: c.topicId,
          kind: "mcq",
          position: firstPosition + i,
          prompt: c.q.question.trim(),
          options,
          correctIndex,
          explanation: c.q.explanation.trim(),
          difficulty: c.q.difficulty,
          normalizedPrompt: normalizePrompt(c.q.question),
          promptVersion: quizPrompt.PROMPT_VERSION,
        })
        .returning({ id: learningItems.id });
      await tx
        .insert(itemSources)
        .values([...new Set(c.chunkIds)].map((chunkId) => ({ spaceId: set.spaceId, itemId: item.id, chunkId })));
    }
  });
}

/** At least 5 questions → ready; fewer → failed. */
const publish = (job: Job, set: StudySet) => publishSet(job, set, MIN_PUBLISHED_QUESTIONS, "TOO_FEW_QUESTIONS");

export const generateQuizJob = {
  run: (job: Job) => runGeneration(job, { writeGroup, publish }),
  fail: (job: Job) => failGeneration(job, "PROCESSING_FAILED"),
};
