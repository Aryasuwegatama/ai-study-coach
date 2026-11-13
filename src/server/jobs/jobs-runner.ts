import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { jobs } from "@/server/db/schema";
import { processMaterialJob } from "@/features/materials/server";
import { MAX_STEP_ATTEMPTS, type StepMessage } from "./jobs-client";

/**
 * Runs one delivered job step (PRD Section 4, "How a step runs"). A
 * handler's `run` does its network work outside any transaction and then
 * commits its output and the next step only while it still holds the
 * claim. Throwing means "try again": the claim is released and QStash
 * redelivers, until the attempts run out and `fail` ends the job.
 */
type Job = typeof jobs.$inferSelect;
type JobHandler = {
  run(job: Job): Promise<void>;
  fail(job: Job, code: "PROCESSING_FAILED"): Promise<void>;
};

const HANDLERS: Record<string, JobHandler> = {
  process_material: processMaterialJob,
};

/** Longer than the 300-second function limit, so a live step never loses its claim. */
const LEASE = sql`now() + interval '6 minutes'`;

export type StepOutcome = "done" | "skipped" | "retry";

export async function runJobStep({ jobId, step }: StepMessage): Promise<StepOutcome> {
  // Atomic claim: this job, this step, not finished, and no live lease.
  // A duplicate delivery while the step runs matches nothing and is skipped.
  const [job] = await db
    .update(jobs)
    .set({
      status: "running",
      claimToken: randomUUID(),
      leaseUntil: LEASE,
      attemptCount: sql`${jobs.attemptCount} + 1`,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.step, step),
        inArray(jobs.status, ["queued", "running"]),
        or(isNull(jobs.leaseUntil), lt(jobs.leaseUntil, sql`now()`)),
      ),
    )
    .returning();
  if (!job) return "skipped";

  const handler = HANDLERS[job.kind];
  try {
    if (!handler) throw new Error(`No handler for job kind "${job.kind}".`);
    await handler.run(job);
    return "done";
  } catch {
    if (handler && job.attemptCount >= MAX_STEP_ATTEMPTS) {
      await handler.fail(job, "PROCESSING_FAILED");
      return "done";
    }
    await db
      .update(jobs)
      .set({ status: "queued", claimToken: null, leaseUntil: null })
      .where(and(eq(jobs.id, job.id), eq(jobs.claimToken, job.claimToken!)));
    return "retry";
  }
}
