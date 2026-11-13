import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, jobs, materials } from "@/server/db/schema";
import { publishStep } from "@/server/jobs/jobs-client";
import { getPrivateBlob } from "@/server/storage/storage-client";
import type { MaterialFailureCode } from "../materials-schemas";
import { packChunks } from "./chunk-text";
import { ExtractionError, extractMaterialText } from "./extract-text";

/**
 * The `process_material` job (T-08a; PRD Section 3, Pipeline A, and
 * Section 4, "Background jobs"). Step names match the material's stages.
 *
 * T-08a runs `extract` (page count, text, cleaning, chunks) and then parks
 * the job at `embed`: material still `processing`, stage `embed`, progress
 * 0 of N. T-08b adds the `embed` and `suggest_topics` steps and publishes
 * `embed` where marked below.
 */
type Job = typeof jobs.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
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

/** The job is still ours: same claim token. Locks the row until commit. */
async function holdsClaim(tx: Tx, job: Job): Promise<boolean> {
  const [row] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.claimToken, job.claimToken!)))
    .for("update");
  return Boolean(row);
}

async function closeJob(tx: Tx, jobId: string, status: "succeeded" | "failed", errorCode: string | null) {
  await tx
    .update(jobs)
    .set({ status, errorCode, finishedAt: new Date(), claimToken: null, leaseUntil: null })
    .where(eq(jobs.id, jobId));
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
  // ponytail: T-08b adds `embed` and `suggest_topics` here.
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
  // ponytail: T-08b publishes the `embed` step here.
}

export const processMaterialJob = { run, fail };
