import { and, eq } from "drizzle-orm";
import type { db } from "@/server/db/db-client";
import { jobs } from "@/server/db/schema";

/** Shared by every job handler's commit transaction (PRD Section 4, "How a step runs"). */
export type Job = typeof jobs.$inferSelect;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The job is still ours: same claim token. Locks the row until commit. */
export async function holdsClaim(tx: Tx, job: Job): Promise<boolean> {
  const [row] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.claimToken, job.claimToken!)))
    .for("update");
  return Boolean(row);
}

/** Moves the job to its next step and releases the step claim (a generation slot is kept). */
export async function advanceJob(tx: Tx, jobId: string, step: string, payload?: unknown): Promise<void> {
  await tx
    .update(jobs)
    .set({ step, status: "queued", claimToken: null, leaseUntil: null, attemptCount: 0, ...(payload === undefined ? {} : { payload }) })
    .where(eq(jobs.id, jobId));
}

/** Terminal: finished, claim and generation slot released. */
export async function closeJob(tx: Tx, jobId: string, status: "succeeded" | "failed", errorCode: string | null): Promise<void> {
  await tx
    .update(jobs)
    .set({
      status,
      errorCode,
      finishedAt: new Date(),
      claimToken: null,
      leaseUntil: null,
      generationSlotAcquired: false,
    })
    .where(eq(jobs.id, jobId));
}
