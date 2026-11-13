import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, jobs, materialTopics, materials, topics } from "@/server/db/schema";
import { AIUnusableError, callAI } from "@/server/ai/call-ai";
import { embedTexts, embeddingModelName } from "@/server/ai/ai-embeddings";
import * as topicsPrompt from "@/server/ai/prompts/topics";
import { publishStep } from "@/server/jobs/jobs-client";
import { closeJob, holdsClaim, type Job, type Tx } from "@/server/jobs/job-claims";
import { getPrivateBlob } from "@/server/storage/storage-client";
import type { MaterialFailureCode } from "../materials-schemas";
import { packChunks } from "./chunk-text";
import { ExtractionError, extractMaterialText } from "./extract-text";

/**
 * The `process_material` job (PRD Section 3, Pipeline A, and Section 4,
 * "Background jobs"). Step names match the material's stages:
 *
 * - `extract` (T-08a): page count, text, cleaning, chunks.
 * - `embed` (T-08b): up to 50 chunks per step, repeated until every chunk
 *   has a vector; progress shows "N of M".
 * - `suggest_topics` (T-08b): one AI call, saved as a draft; the material
 *   moves to `review_topics` and the job succeeds.
 *
 * Every step commits its output and the next step only while it still
 * holds the claim, then publishes the next step after commit.
 */
type Material = typeof materials.$inferSelect;

/**
 * Creates the material's one job, or resets it for a retry (same row,
 * same step, fresh attempt budget). Runs inside the caller's transaction,
 * so the status change and the job commit together.
 */
export async function queueProcessing(tx: Tx, material: Material, userId: string): Promise<{ id: string; step: string }> {
  const [job] = await tx
    .insert(jobs)
    .values({
      userId,
      spaceId: material.spaceId,
      kind: "process_material",
      targetId: material.id,
      step: "extract",
      idempotencyKey: `process_material:${material.id}`,
    })
    .onConflictDoUpdate({
      target: jobs.idempotencyKey,
      set: { status: "queued", attemptCount: 0, errorCode: null, finishedAt: null, claimToken: null, leaseUntil: null },
    })
    .returning({ id: jobs.id, step: jobs.step });
  return job;
}

/**
 * Publishes the queued step after commit. If QStash refuses it, the
 * material fails now ("Processing failed. Try again.") rather than sitting
 * in Processing forever; Retry publishes again.
 */
export async function startProcessing(materialId: string, job: { id: string; step: string }): Promise<void> {
  try {
    await publishStep({ jobId: job.id, step: job.step });
  } catch {
    await db.transaction(async (tx) => {
      await failMaterial(tx, materialId, "PROCESSING_FAILED");
      await closeJob(tx, job.id, "failed", "PUBLISH_FAILED");
    });
  }
}

async function failMaterial(tx: Tx, materialId: string, code: MaterialFailureCode) {
  await tx
    .update(materials)
    .set({ status: "failed", errorCode: code })
    .where(and(eq(materials.id, materialId), eq(materials.status, "processing")));
}

/** The material is still there and processing; locked until commit, so a delete waits. */
async function lockProcessingMaterial(tx: Tx, materialId: string): Promise<boolean> {
  const [row] = await tx
    .select({ status: materials.status })
    .from(materials)
    .where(eq(materials.id, materialId))
    .for("update");
  return row?.status === "processing";
}

/** Called by the runner once a step's attempts are used up, or for a failure the same file always hits. */
async function fail(job: Job, code: MaterialFailureCode): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    await failMaterial(tx, job.targetId!, code);
    await closeJob(tx, job.id, "failed", code);
  });
}

async function run(job: Job): Promise<void> {
  if (job.step === "embed") return embedStep(job);
  if (job.step === "suggest_topics") return suggestTopicsStep(job);
  if (job.step !== "extract") throw new Error(`No handler for step "${job.step}".`);
  const materialId = job.targetId!;

  const [material] = await db.select().from(materials).where(eq(materials.id, materialId));
  if (material?.status !== "processing") {
    // Deleted, or no longer processing: nothing to do.
    await db.transaction(async (tx) => {
      if (await holdsClaim(tx, job)) await closeJob(tx, job.id, "failed", "MATERIAL_GONE");
    });
    return;
  }

  // Network work happens outside any transaction (PRD Section 4).
  const blob = await getPrivateBlob(material.blobPath);
  if (!blob) throw new Error("The material's file could not be read.");
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());

  let extracted;
  try {
    extracted = await extractMaterialText(material.originalName, bytes);
  } catch (error) {
    if (error instanceof ExtractionError) return fail(job, error.code);
    throw error;
  }
  const drafts = packChunks(extracted.units);

  await db.transaction(async (tx) => {
    // A stale claim (lease expired, someone else took the step) commits nothing.
    if (!(await holdsClaim(tx, job))) return;
    if (!(await lockProcessingMaterial(tx, materialId))) {
      await closeJob(tx, job.id, "failed", "MATERIAL_GONE");
      return;
    }
    // Replace, so a replayed step never duplicates chunks.
    await tx.delete(chunks).where(eq(chunks.materialId, materialId));
    await tx.insert(chunks).values(
      drafts.map((d, i) => ({
        materialId,
        spaceId: material.spaceId,
        chunkIndex: i,
        content: d.content,
        pageStart: d.pageStart,
        pageEnd: d.pageEnd,
      })),
    );
    await tx
      .update(materials)
      .set({
        stage: "embed",
        pageCount: extracted.pageCount,
        charCount: extracted.charCount,
        progressDone: 0,
        progressTotal: drafts.length,
      })
      .where(eq(materials.id, materialId));
    await tx
      .update(jobs)
      .set({ step: "embed", status: "queued", claimToken: null, leaseUntil: null, attemptCount: 0 })
      .where(eq(jobs.id, job.id));
  });
  await publishIfAdvanced(job, "embed");
}

/** After a commit: publish the next step if this worker's commit is what advanced the job. */
async function publishIfAdvanced(job: Job, step: string) {
  const [row] = await db.select({ step: jobs.step, status: jobs.status }).from(jobs).where(eq(jobs.id, job.id));
  if (row?.status === "queued" && row.step === step) await startProcessing(job.targetId!, { id: job.id, step });
}

/** Loads the material if it's still processing, or closes the job and returns null. */
async function processingMaterial(job: Job): Promise<Material | null> {
  const [material] = await db.select().from(materials).where(eq(materials.id, job.targetId!));
  if (material?.status === "processing") return material;
  await db.transaction(async (tx) => {
    if (await holdsClaim(tx, job)) await closeJob(tx, job.id, "failed", "MATERIAL_GONE");
  });
  return null;
}

export const EMBED_BATCH = 50;

async function embedStep(job: Job): Promise<void> {
  const material = await processingMaterial(job);
  if (!material) return;
  const batch = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .where(and(eq(chunks.materialId, material.id), isNull(chunks.embedding)))
    .orderBy(asc(chunks.chunkIndex))
    .limit(EMBED_BATCH);

  const { vectors } = batch.length
    ? await embedTexts(batch.map((c) => c.content), "RETRIEVAL_DOCUMENT", { jobId: job.id, purpose: "embed" })
    : { vectors: [] };
  const model = embeddingModelName();

  let next = "embed";
  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    if (!(await lockProcessingMaterial(tx, material.id))) {
      await closeJob(tx, job.id, "failed", "MATERIAL_GONE");
      return;
    }
    for (let i = 0; i < batch.length; i++) {
      await tx.update(chunks).set({ embedding: vectors[i], embeddingModel: model }).where(eq(chunks.id, batch[i].id));
    }
    const [{ done, total }] = await tx
      .select({ done: count(chunks.embedding), total: count() })
      .from(chunks)
      .where(eq(chunks.materialId, material.id));
    next = done < total ? "embed" : "suggest_topics";
    await tx
      .update(materials)
      .set({ stage: next === "embed" ? "embed" : "suggest_topics", progressDone: done, progressTotal: total })
      .where(eq(materials.id, material.id));
    await tx
      .update(jobs)
      .set({ step: next, status: "queued", claimToken: null, leaseUntil: null, attemptCount: 0 })
      .where(eq(jobs.id, job.id));
  });
  await publishIfAdvanced(job, next);
}

async function suggestTopicsStep(job: Job): Promise<void> {
  const material = await processingMaterial(job);
  if (!material) return;
  const pieces = await db
    .select({ pageStart: chunks.pageStart, pageEnd: chunks.pageEnd, content: chunks.content })
    .from(chunks)
    .where(eq(chunks.materialId, material.id))
    .orderBy(asc(chunks.chunkIndex));
  const prompt = topicsPrompt.buildPrompt(pieces);
  if (topicsPrompt.estimateTokens(prompt) > topicsPrompt.TOPIC_INPUT_TOKEN_BUDGET) {
    throw new Error("Topic prompt is over the token budget.");
  }

  let suggestions: topicsPrompt.TopicSuggestions;
  try {
    suggestions = await callAI({
      jobId: job.id,
      purpose: "suggest_topics",
      promptVersion: topicsPrompt.PROMPT_VERSION,
      model: "generate",
      schema: topicsPrompt.topicSuggestionsSchema,
      system: topicsPrompt.SYSTEM,
      prompt,
      validate: (value) => topicsPrompt.checkSuggestions(value, material.pageCount ?? 0),
      fake: () => topicsPrompt.fakeSuggestions(pieces),
    });
  } catch (error) {
    if (error instanceof AIUnusableError) return fail(job, "AI_UNUSABLE_ANSWER");
    throw error;
  }

  await db.transaction(async (tx) => {
    if (!(await holdsClaim(tx, job))) return;
    if (!(await lockProcessingMaterial(tx, material.id))) {
      await closeJob(tx, job.id, "failed", "MATERIAL_GONE");
      return;
    }
    // Replace any earlier draft, so a replayed step never duplicates topics.
    const old = await tx
      .select({ id: topics.id })
      .from(materialTopics)
      .innerJoin(topics, eq(topics.id, materialTopics.topicId))
      .where(and(eq(materialTopics.materialId, material.id), eq(topics.status, "draft")));
    if (old.length) await tx.delete(topics).where(inArray(topics.id, old.map((t) => t.id)));

    for (const t of suggestions.topics) {
      const [row] = await tx
        .insert(topics)
        .values({
          spaceId: material.spaceId,
          name: t.name.trim(),
          normalizedName: topicsPrompt.normalizeTopicName(t.name),
          description: t.description.trim(),
          status: "draft",
          origin: "ai",
        })
        .returning({ id: topics.id });
      await tx.insert(materialTopics).values({
        spaceId: material.spaceId,
        materialId: material.id,
        topicId: row.id,
        pages: [...new Set(t.pages)].sort((a, b) => a - b),
      });
    }
    await tx
      .update(materials)
      .set({ status: "review_topics", stage: null, progressDone: null, progressTotal: null })
      .where(eq(materials.id, material.id));
    await closeJob(tx, job.id, "succeeded", null);
  });
}

export const processMaterialJob = { run, fail };
