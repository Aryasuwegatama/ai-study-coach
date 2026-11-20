import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, jobs, learningItems, materialTopics, studySets, topics } from "@/server/db/schema";
import { publishStep } from "@/server/jobs/jobs-client";
import { advanceJob, closeJob, holdsClaim, type Job, type Tx } from "@/server/jobs/job-claims";
import { AIUnusableError } from "@/server/ai/call-ai";
import { embedTexts } from "@/server/ai/ai-embeddings";
import { searchChunks } from "@/features/materials/server";
import {
  MAX_ACTIVE_GENERATIONS,
  MAX_CHUNKS_PER_TOPIC,
  MAX_QUESTIONS_THIN_TOPIC,
  MAX_SOURCES_PER_REQUEST,
  spreadQuestions,
  type CardStyle,
  type SetFailureCode,
} from "../quizzes-schemas";

/**
 * The steps `generate_quiz` and `generate_deck` share (PRD Section 3,
 * Pipelines B and C; Section 4, "Background jobs"): taking a generation
 * slot, retrieving sources per topic, planning groups of at most 40 sources,
 * the step plumbing, the duplicate check's published prompts, and the commit
 * of one group's accepted items. Extracted from `generate-quiz.ts` in T-18
 * so a deck job runs the same code; the quiz job behaves exactly as before.
 * What differs (the prompt, the checks and the saved item) stays in each job.
 */

/** A topic in the plan; `recall` is set for decks only (how many of `count` are recall cards). */
export type PlanTopic = { topicId: string; chunkIds: string[]; count: number; recall?: number };
export type Plan = { groups: { topics: PlanTopic[] }[] };
export type StudySet = typeof studySets.$inferSelect;
export type { Tx };

/** Any constant shared by every generation admission (pg advisory lock key). */
const GENERATION_LOCK = 4_208_011;
const SLOT_WAIT_SECONDS = 30;

async function publishNext(job: Job, setId: string, step: string, delaySeconds?: number) {
  try {
    await publishStep({ jobId: job.id, step }, { flow: "generation", delaySeconds });
  } catch {
    await db.transaction(async (tx) => {
      await failSet(tx, setId, "GENERATION_FAILED");
      await closeJob(tx, job.id, "failed", "PUBLISH_FAILED");
    });
  }
}

/** After commit: publish the next step only if this worker's commit advanced the job. */
export async function publishIfAdvanced(job: Job, setId: string) {
  const [row] = await db.select({ step: jobs.step, status: jobs.status }).from(jobs).where(eq(jobs.id, job.id));
  if (row?.status === "queued" && row.step !== job.step) await publishNext(job, setId, row.step);
}

export async function failSet(tx: Tx, setId: string, code: SetFailureCode) {
  await tx.delete(learningItems).where(eq(learningItems.setId, setId));
  await tx
    .update(studySets)
    .set({ status: "failed", errorCode: code, generatedCount: 0 })
    .where(and(eq(studySets.id, setId), eq(studySets.status, "generating")));
}

/** Ends the job for good (attempts used up, or an unusable AI answer twice). */
export async function failGeneration(job: Job, code: "PROCESSING_FAILED" | "AI_UNUSABLE_ANSWER"): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    await failSet(tx, job.targetId!, code === "AI_UNUSABLE_ANSWER" ? "AI_UNUSABLE_ANSWER" : "GENERATION_FAILED");
    await closeJob(tx, job.id, "failed", code);
  });
}

/** Runs one delivered step: `retrieve`, `write:k`, `top_up:k` or `publish`, for either job kind. */
export async function runGeneration(
  job: Job,
  handlers: {
    writeGroup(job: Job, set: StudySet, k: number, topUp: boolean): Promise<void>;
    publish(job: Job, set: StudySet): Promise<void>;
  },
): Promise<void> {
  const [set] = await db.select().from(studySets).where(eq(studySets.id, job.targetId!));
  if (set?.status !== "generating") {
    await db.transaction(async (tx) => {
      if (await holdsClaim(tx, job)) await closeJob(tx, job.id, "failed", "SET_GONE");
    });
    return;
  }
  try {
    if (job.step === "retrieve") return await retrieve(job, set);
    if (job.step === "publish") return await handlers.publish(job, set);
    const match = /^(write|top_up):(\d+)$/.exec(job.step);
    if (!match) throw new Error(`No handler for step "${job.step}".`);
    await handlers.writeGroup(job, set, Number(match[2]), match[1] === "top_up");
  } catch (error) {
    if (error instanceof AIUnusableError) return failGeneration(job, "AI_UNUSABLE_ANSWER");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// retrieve
// ---------------------------------------------------------------------------

/** Takes a generation slot, or puts the job back to wait and returns false. */
async function admit(job: Job, setId: string): Promise<boolean> {
  if (job.generationSlotAcquired) return true;
  const admitted = await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return null;
    await tx.execute(sql`select pg_advisory_xact_lock(${GENERATION_LOCK})`);
    const [{ active }] = await tx
      .select({ active: count() })
      .from(jobs)
      .where(
        and(
          inArray(jobs.kind, ["generate_quiz", "generate_deck"]),
          eq(jobs.generationSlotAcquired, true),
          inArray(jobs.status, ["queued", "running"]),
          ne(jobs.id, job.id),
          // ponytail: a holder untouched for 15 minutes is treated as stranded
          // (no reconciler yet), so it can't block generation forever.
          sql`${jobs.updatedAt} > now() - interval '15 minutes'`,
        ),
      );
    if (active >= MAX_ACTIVE_GENERATIONS) {
      // Waiting for a slot doesn't use up an attempt.
      await tx
        .update(jobs)
        .set({ status: "queued", claimToken: null, leaseUntil: null, attemptCount: sql`${jobs.attemptCount} - 1` })
        .where(eq(jobs.id, job.id));
      return false;
    }
    await tx.update(jobs).set({ generationSlotAcquired: true }).where(eq(jobs.id, job.id));
    return true;
  });
  if (admitted === false) await publishNext(job, setId, job.step, SLOT_WAIT_SECONDS);
  return admitted === true;
}

/**
 * How many of each topic's cards are recall cards: all of them, none, or for
 * Mix every other card of the whole deck starting with a recall card, so the
 * deck is half and half and recall takes the odd one (PRD Section 3).
 */
export function recallCounts(counts: number[], style: CardStyle): number[] {
  if (style === "recall") return [...counts];
  if (style === "short_answer") return counts.map(() => 0);
  let slot = 0;
  return counts.map((n) => {
    let recall = 0;
    for (let i = 0; i < n; i++, slot++) if (slot % 2 === 0) recall++;
    return recall;
  });
}

async function retrieve(job: Job, set: StudySet): Promise<void> {
  if (!(await admit(job, set.id))) return;

  const rows = await db
    .select()
    .from(topics)
    .where(and(eq(topics.spaceId, set.spaceId), inArray(topics.id, set.topicIds), eq(topics.status, "confirmed")));
  const ordered = set.topicIds.map((id) => rows.find((t) => t.id === id)).filter((t) => t !== undefined);

  const { vectors } = ordered.length
    ? await embedTexts(ordered.map((t) => `${t.name}: ${t.description}`), "RETRIEVAL_QUERY", { jobId: job.id, purpose: "embed_query" })
    : { vectors: [] };

  const picked: { topicId: string; chunkIds: string[] }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const topic = ordered[i];
    const nearest = await searchChunks({
      spaceId: set.spaceId,
      materialIds: set.materialIds,
      queryVector: vectors[i],
      limit: MAX_CHUNKS_PER_TOPIC - 2,
    });
    // Plus up to 2 chunks from the pages the topic was found on.
    const pages = (
      await db
        .select({ pages: materialTopics.pages })
        .from(materialTopics)
        .where(and(eq(materialTopics.topicId, topic.id), inArray(materialTopics.materialId, set.materialIds)))
    ).flatMap((r) => r.pages);
    const onPages = pages.length
      ? await db
          .select({ id: chunks.id })
          .from(chunks)
          .where(
            and(
              eq(chunks.spaceId, set.spaceId),
              inArray(chunks.materialId, set.materialIds),
              sql`exists (select 1 from unnest(${sql.raw(`array[${pages.map(Number).join(",")}]::int[]`)}) p where p between ${chunks.pageStart} and ${chunks.pageEnd})`,
              nearest.length ? sql`${chunks.id} not in ${nearest.map((c) => c.id)}` : undefined,
            ),
          )
          .orderBy(asc(chunks.chunkIndex))
          .limit(2)
      : [];
    const chunkIds = [...new Set([...nearest.map((c) => c.id), ...onPages.map((c) => c.id)])].slice(0, MAX_CHUNKS_PER_TOPIC);
    picked.push({ topicId: topic.id, chunkIds });
  }

  // Even spread; a topic with fewer than two chunks gets at most 3, and what
  // it can't take goes round the better-supported topics.
  const counts = spreadQuestions(set.requestedCount, picked.length).map((n, i) =>
    picked[i].chunkIds.length === 0 ? 0 : picked[i].chunkIds.length < 2 ? Math.min(n, MAX_QUESTIONS_THIN_TOPIC) : n,
  );
  const strong = picked.map((p, i) => (p.chunkIds.length >= 2 ? i : -1)).filter((i) => i >= 0);
  for (let left = set.requestedCount - counts.reduce((a, b) => a + b, 0), r = 0; left > 0 && strong.length; left--, r++) {
    counts[strong[r % strong.length]]++;
  }
  const recall = set.kind === "deck" ? recallCounts(counts, (set.cardStyle ?? "recall") as CardStyle) : null;

  const plan: Plan = { groups: [] };
  let sources = Infinity;
  picked.forEach((p, i) => {
    if (counts[i] === 0) return;
    if (sources + p.chunkIds.length > MAX_SOURCES_PER_REQUEST) {
      plan.groups.push({ topics: [] });
      sources = 0;
    }
    plan.groups.at(-1)!.topics.push({ ...p, count: counts[i], ...(recall ? { recall: recall[i] } : {}) });
    sources += p.chunkIds.length;
  });

  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    await advanceJob(tx, job.id, plan.groups.length ? "write:0" : "publish", plan);
  });
  await publishIfAdvanced(job, set.id);
}

// ---------------------------------------------------------------------------
// write:k and top_up:k
// ---------------------------------------------------------------------------

function nextStep(plan: Plan, k: number, topUp: boolean): string {
  if (k + 1 < plan.groups.length) return `${topUp ? "top_up" : "write"}:${k + 1}`;
  return topUp ? "publish" : "top_up:0";
}

export type LabelledChunk = { label: string; chunkId: string; content: string; pages: string };

/** The cited chunks of a group's wanted topics, labelled `S1`, `S2`… in order (each chunk once). */
export async function labelSources(wanted: PlanTopic[]): Promise<{ sources: LabelledChunk[]; labelOf: Map<string, string> }> {
  const chunkRows = await db
    .select()
    .from(chunks)
    .where(inArray(chunks.id, [...new Set(wanted.flatMap((t) => t.chunkIds))]));
  const byId = new Map(chunkRows.map((c) => [c.id, c]));
  const sources: LabelledChunk[] = [];
  const labelOf = new Map<string, string>();
  for (const t of wanted) {
    for (const id of t.chunkIds) {
      const c = byId.get(id);
      if (!c || labelOf.has(id)) continue;
      const label = `S${sources.length + 1}`;
      labelOf.set(id, label);
      sources.push({ label, chunkId: id, content: c.content, pages: c.pageStart === c.pageEnd ? `${c.pageStart}` : `${c.pageStart}-${c.pageEnd}` });
    }
  }
  return { sources, labelOf };
}

/** Items already saved on this set (this job's earlier steps). */
export async function loadExisting(setId: string) {
  return db
    .select({
      topicId: learningItems.topicId,
      kind: learningItems.kind,
      prompt: learningItems.prompt,
      normalizedPrompt: learningItems.normalizedPrompt,
    })
    .from(learningItems)
    .where(eq(learningItems.setId, setId));
}

/**
 * Normalised prompts already published for these topics by ready sets, among
 * items of the given kinds (a quiz compares with questions, a deck with cards).
 */
export async function loadPublishedPrompts(topicIds: string[], kinds: string[]): Promise<string[]> {
  const rows = await db
    .select({ normalizedPrompt: learningItems.normalizedPrompt })
    .from(learningItems)
    .innerJoin(studySets, eq(studySets.id, learningItems.setId))
    .where(
      and(
        inArray(learningItems.topicId, topicIds),
        inArray(learningItems.kind, kinds),
        eq(learningItems.status, "active"),
        eq(studySets.status, "ready"),
      ),
    );
  return rows.map((r) => r.normalizedPrompt);
}

/**
 * Saves a group's accepted items and moves the job to its next step, only
 * while the job still holds its claim and the set is still generating
 * (`insert` gets the first free position). Then publishes the next step.
 */
export async function commitGroup(
  job: Job,
  set: StudySet,
  plan: Plan,
  k: number,
  topUp: boolean,
  insert: (tx: Tx, firstPosition: number) => Promise<void>,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    const [locked] = await tx.select({ status: studySets.status }).from(studySets).where(eq(studySets.id, set.id)).for("update");
    if (locked?.status !== "generating") {
      await closeJob(tx, job.id, "failed", "SET_GONE");
      return;
    }
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${learningItems.position}), -1)`.mapWith(Number) })
      .from(learningItems)
      .where(eq(learningItems.setId, set.id));
    await insert(tx, max + 1);
    await advanceJob(tx, job.id, nextStep(plan, k, topUp));
  });
  await publishIfAdvanced(job, set.id);
}

/** The step handler's last act: `ready` with the number published, or failed with the given code. */
export async function publishSet(job: Job, set: StudySet, minimum: number, failure: SetFailureCode): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    const [{ n }] = await tx.select({ n: count() }).from(learningItems).where(eq(learningItems.setId, set.id));
    if (n >= minimum) {
      await tx.update(studySets).set({ status: "ready", generatedCount: n }).where(eq(studySets.id, set.id));
      await closeJob(tx, job.id, "succeeded", null);
    } else {
      await failSet(tx, set.id, failure);
      await closeJob(tx, job.id, "failed", failure);
    }
  });
}
