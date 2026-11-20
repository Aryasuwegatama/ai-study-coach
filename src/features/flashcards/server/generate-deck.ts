import { inArray } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { itemSources, learningItems, topics } from "@/server/db/schema";
import { type Job } from "@/server/jobs/job-claims";
import { callAI } from "@/server/ai/call-ai";
import * as cardsPrompt from "@/server/ai/prompts/cards";
import { normalizePrompt } from "@/features/quizzes/quizzes-schemas";
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
} from "@/features/quizzes/server";

/**
 * The `generate_deck` job (T-18; PRD Section 3, Pipeline C). The same steps
 * as the quiz job (`retrieve` → `write:k` → `top_up:k` → `publish`), the same
 * slot admission, retries and "set deleted" handling: those live in
 * `quizzes/server/generation-shared.ts`. This file has what differs: the card
 * prompt, the card code checks, the answer check ("is the back supported by
 * the cited sources?") and the publish rule (any number of passing cards;
 * none means failed).
 */

type Accepted = { card: cardsPrompt.WrittenCard; topicId: string; chunkIds: string[] };

async function writeGroup(job: Job, set: StudySet, k: number, topUp: boolean): Promise<void> {
  const plan = job.payload as Plan;
  const group = plan.groups[k];
  const existing = await loadExisting(set.id);

  // What each topic still needs, by card kind (the plan splits a topic's count into recall and short answer).
  const needs = group.topics
    .map((t) => {
      const recallPlanned = t.recall ?? t.count;
      const have = existing.filter((e) => e.topicId === t.topicId);
      return {
        topic: t,
        recall: Math.max(0, recallPlanned - have.filter((e) => e.kind === "recall").length),
        short: Math.max(0, t.count - recallPlanned - have.filter((e) => e.kind === "short_answer").length),
      };
    })
    .filter((n) => n.recall + n.short > 0);

  const accepted: Accepted[] = [];
  if (needs.length) {
    const wanted = needs.map((n) => n.topic);
    const { sources, labelOf } = await labelSources(wanted);
    const topicRows = await db.select().from(topics).where(inArray(topics.id, wanted.map((t) => t.topicId)));
    const labelled: cardsPrompt.LabelledCardTopic[] = needs.map((n, i) => {
      const row = topicRows.find((r) => r.id === n.topic.topicId)!;
      return {
        label: `T${i + 1}`,
        name: row.name,
        description: row.description,
        recall: n.recall,
        short: n.short,
        sourceLabels: n.topic.chunkIds.map((id) => labelOf.get(id)).filter((l): l is string => Boolean(l)),
      };
    });

    // Not a duplicate of this deck or of cards already published for these topics.
    const published = await loadPublishedPrompts(wanted.map((t) => t.topicId), ["recall", "short_answer"]);
    const seen = new Set([...existing.map((e) => e.normalizedPrompt), ...published]);
    const wantedIds = new Set(wanted.map((t) => t.topicId));
    const avoid = existing.filter((e) => wantedIds.has(e.topicId)).map((e) => e.prompt).slice(0, 20);

    const written = await callAI({
      jobId: job.id,
      purpose: "write_cards",
      promptVersion: cardsPrompt.PROMPT_VERSION,
      model: "generate",
      schema: cardsPrompt.writtenCardsSchema,
      system: cardsPrompt.WRITE_SYSTEM,
      prompt: cardsPrompt.buildWritePrompt(labelled, sources, avoid),
      fake: () => cardsPrompt.fakeCardsOrOverride(labelled, sources, topUp ? 2 : 1),
    });

    const topicLabels = new Map(labelled.map((t, i) => [t.label, needs[i].topic.topicId]));
    const sourceLabels = new Map(sources.map((s) => [s.label, s]));
    const left = new Map(needs.map((n) => [n.topic.topicId, { recall: n.recall, short: n.short }]));
    const candidates: Accepted[] = [];
    for (const card of written.cards) {
      const topicId = topicLabels.get(card.topic);
      const problem =
        cardsPrompt.cardProblem(card) ??
        (!topicId ? "unknown topic label" : null) ??
        (!card.sources.length || card.sources.some((s) => !sourceLabels.has(s)) ? "unknown source label" : null) ??
        (seen.has(normalizePrompt(card.front)) ? "duplicate front" : null);
      if (problem || !topicId) {
        console.info(`[generate_deck] set ${set.id}: rejected by code check (${problem})`);
        continue;
      }
      const quota = left.get(topicId)!;
      const slot = card.kind === "recall" ? "recall" : "short";
      if (quota[slot] <= 0) continue;
      quota[slot]--;
      seen.add(normalizePrompt(card.front));
      candidates.push({ card, topicId, chunkIds: card.sources.map((s) => sourceLabels.get(s)!.chunkId) });
    }

    if (candidates.length) {
      const toCheck = candidates.map((c, i) => ({
        id: `C${i + 1}`,
        kind: c.card.kind,
        front: c.card.front,
        back: c.card.back,
        sources: c.card.sources.map((s) => sourceLabels.get(s)!),
      }));
      const checked = await callAI({
        jobId: job.id,
        purpose: "check_cards",
        promptVersion: cardsPrompt.CHECK_PROMPT_VERSION,
        model: "check",
        schema: cardsPrompt.cardCheckSchema,
        system: cardsPrompt.CHECK_SYSTEM,
        prompt: cardsPrompt.buildCheckPrompt(toCheck),
        fake: () => cardsPrompt.fakeCheckOrOverride(toCheck),
      });
      const verdicts = new Map(checked.results.map((r) => [r.id, r]));
      candidates.forEach((c, i) => {
        const v = verdicts.get(`C${i + 1}`);
        if (v?.supported) accepted.push(c);
        else console.info(`[generate_deck] set ${set.id}: rejected by answer check (${v?.reason ?? "no verdict"})`);
      });
    }
  }

  await commitGroup(job, set, plan, k, topUp, async (tx, firstPosition) => {
    for (const [i, c] of accepted.entries()) {
      const [item] = await tx
        .insert(learningItems)
        .values({
          setId: set.id,
          spaceId: set.spaceId,
          topicId: c.topicId,
          kind: c.card.kind,
          position: firstPosition + i,
          prompt: c.card.front.trim(),
          answerText: c.card.back.trim(),
          keyPoints: c.card.kind === "short_answer" ? c.card.keyPoints.map((p) => p.trim()) : null,
          normalizedPrompt: normalizePrompt(c.card.front),
          promptVersion: cardsPrompt.PROMPT_VERSION,
        })
        .returning({ id: learningItems.id });
      await tx
        .insert(itemSources)
        .values([...new Set(c.chunkIds)].map((chunkId) => ({ spaceId: set.spaceId, itemId: item.id, chunkId })));
    }
  });
}

/** Any number of passing cards → ready ("12 of 15 generated"); none → failed. */
const publish = (job: Job, set: StudySet) => publishSet(job, set, 1, "NO_CARDS");

export const generateDeckJob = {
  run: (job: Job) => runGeneration(job, { writeGroup, publish }),
  fail: (job: Job) => failGeneration(job, "PROCESSING_FAILED"),
};
