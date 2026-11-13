import { randomInt } from "node:crypto";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, itemSources, jobs, learningItems, materialTopics, studySets, topics } from "@/server/db/schema";
import { publishStep } from "@/server/jobs/jobs-client";
import { advanceJob, closeJob, holdsClaim, type Job } from "@/server/jobs/job-claims";
import { AIUnusableError, callAI } from "@/server/ai/call-ai";
import { embedTexts } from "@/server/ai/ai-embeddings";
import * as quizPrompt from "@/server/ai/prompts/quiz";
import { searchChunks } from "@/features/materials/server";
import {
  MAX_ACTIVE_GENERATIONS,
  MAX_CHUNKS_PER_TOPIC,
  MAX_QUESTIONS_THIN_TOPIC,
  MAX_SOURCES_PER_REQUEST,
  MIN_PUBLISHED_QUESTIONS,
  normalizePrompt,
  spreadQuestions,
  type SetFailureCode,
} from "../quizzes-schemas";

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
 */
type Plan = { groups: { topics: { topicId: string; chunkIds: string[]; count: number }[] }[] };
type StudySet = typeof studySets.$inferSelect;

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
async function publishIfAdvanced(job: Job, setId: string) {
  const [row] = await db.select({ step: jobs.step, status: jobs.status }).from(jobs).where(eq(jobs.id, job.id));
  if (row?.status === "queued" && row.step !== job.step) await publishNext(job, setId, row.step);
}

async function failSet(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], setId: string, code: SetFailureCode) {
  await tx.delete(learningItems).where(eq(learningItems.setId, setId));
  await tx
    .update(studySets)
    .set({ status: "failed", errorCode: code, generatedCount: 0 })
    .where(and(eq(studySets.id, setId), eq(studySets.status, "generating")));
}

async function fail(job: Job, code: "PROCESSING_FAILED" | "AI_UNUSABLE_ANSWER"): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    await failSet(tx, job.targetId!, code === "AI_UNUSABLE_ANSWER" ? "AI_UNUSABLE_ANSWER" : "GENERATION_FAILED");
    await closeJob(tx, job.id, "failed", code);
  });
}

async function run(job: Job): Promise<void> {
  const [set] = await db.select().from(studySets).where(eq(studySets.id, job.targetId!));
  if (set?.status !== "generating") {
    await db.transaction(async (tx) => {
      if (await holdsClaim(tx, job)) await closeJob(tx, job.id, "failed", "SET_GONE");
    });
    return;
  }
  try {
    if (job.step === "retrieve") return await retrieve(job, set);
    if (job.step === "publish") return await publish(job, set);
    const match = /^(write|top_up):(\d+)$/.exec(job.step);
    if (!match) throw new Error(`No handler for step "${job.step}".`);
    await writeGroup(job, set, Number(match[2]), match[1] === "top_up");
  } catch (error) {
    if (error instanceof AIUnusableError) return fail(job, "AI_UNUSABLE_ANSWER");
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

  const plan: Plan = { groups: [] };
  let sources = Infinity;
  picked.forEach((p, i) => {
    if (counts[i] === 0) return;
    if (sources + p.chunkIds.length > MAX_SOURCES_PER_REQUEST) {
      plan.groups.push({ topics: [] });
      sources = 0;
    }
    plan.groups.at(-1)!.topics.push({ ...p, count: counts[i] });
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
  const existing = await db
    .select({ topicId: learningItems.topicId, prompt: learningItems.prompt, normalizedPrompt: learningItems.normalizedPrompt })
    .from(learningItems)
    .where(eq(learningItems.setId, set.id));
  const need = new Map(group.topics.map((t) => [t.topicId, t.count - existing.filter((e) => e.topicId === t.topicId).length]));
  const wanted = group.topics.filter((t) => need.get(t.topicId)! > 0);

  const accepted: { q: quizPrompt.WrittenQuestion; topicId: string; chunkIds: string[] }[] = [];
  if (wanted.length) {
    const chunkRows = await db
      .select()
      .from(chunks)
      .where(inArray(chunks.id, [...new Set(wanted.flatMap((t) => t.chunkIds))]));
    const byId = new Map(chunkRows.map((c) => [c.id, c]));
    const sources: (quizPrompt.LabelledSource & { chunkId: string })[] = [];
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
    const published = await db
      .select({ normalizedPrompt: learningItems.normalizedPrompt })
      .from(learningItems)
      .innerJoin(studySets, eq(studySets.id, learningItems.setId))
      .where(
        and(
          inArray(learningItems.topicId, wanted.map((t) => t.topicId)),
          eq(learningItems.status, "active"),
          eq(studySets.status, "ready"),
        ),
      );
    const seen = new Set([...existing.map((e) => e.normalizedPrompt), ...published.map((p) => p.normalizedPrompt)]);
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
    for (const q of written.questions) {
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
    for (const [i, c] of accepted.entries()) {
      const { options, correctIndex } = shuffledOptions(c.q.options, c.q.correctOption);
      const [item] = await tx
        .insert(learningItems)
        .values({
          setId: set.id,
          spaceId: set.spaceId,
          topicId: c.topicId,
          kind: "mcq",
          position: max + 1 + i,
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
    await advanceJob(tx, job.id, nextStep(plan, k, topUp));
  });
  await publishIfAdvanced(job, set.id);
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

async function publish(job: Job, set: StudySet): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    const [{ n }] = await tx.select({ n: count() }).from(learningItems).where(eq(learningItems.setId, set.id));
    if (n >= MIN_PUBLISHED_QUESTIONS) {
      await tx.update(studySets).set({ status: "ready", generatedCount: n }).where(eq(studySets.id, set.id));
      await closeJob(tx, job.id, "succeeded", null);
    } else {
      await failSet(tx, set.id, "TOO_FEW_QUESTIONS");
      await closeJob(tx, job.id, "failed", "TOO_FEW_QUESTIONS");
    }
  });
}

export const generateQuizJob = { run, fail: (job: Job) => fail(job, "PROCESSING_FAILED") };
