import { materialStorage } from "../helpers/materials-fake-storage";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks, jobs } from "@/server/db/schema";
import { MAX_STEP_ATTEMPTS } from "@/server/jobs/jobs-client";
import { processMaterialJob } from "@/features/materials/server";
import { POST as step } from "@/app/api/jobs/step/route";
import { POST as retry } from "@/app/api/materials/[id]/retry/route";
import { DELETE as remove } from "@/app/api/materials/[id]/route";
import {
  createMaterialsFixture,
  materialContext,
  materialRequest,
} from "../helpers/materials-integration-fixture";
import {
  materialStepRequest,
  signMaterialStep,
} from "../helpers/materials-test-signature";

describe("T-10 real database worker claims and retry", () => {
  let f: Awaited<ReturnType<typeof createMaterialsFixture>> | undefined;
  beforeEach(async () => {
    f = await createMaterialsFixture();
  });
  afterEach(async () => {
    await f?.cleanup();
    f = undefined;
  });
  async function prepared() {
    const created = await f!.create();
    expect(
      (
        await f!.complete(
          created,
          Buffer.from(
            "Synthetic database keys ensure consistent relationships and protect data integrity.",
          ),
        )
      ).status,
    ).toBe(200);
    return { created, job: await f!.jobFor(created.material.id) };
  }
  function deliver(id: string, stage = "extract") {
    const body = JSON.stringify({ jobId: id, step: stage });
    return step(
      materialStepRequest(
        body,
        signMaterialStep(body, { key: process.env.QSTASH_CURRENT_SIGNING_KEY }),
      ),
    );
  }
  async function storedChunks(id: string) {
    return db.select().from(chunks).where(eq(chunks.materialId, id));
  }

  it("SEC-JOB-02: concurrent and completed-step replay writes chunks only once", async () => {
    const { created, job } = await prepared();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    materialStorage.beforeRead = async () => {
      enter();
      await held;
    };
    const first = deliver(job.id);
    try {
      await Promise.race([
        entered,
        first.then(() => {
          throw new Error(
            "Worker finished before reaching the controlled read.",
          );
        }),
      ]);
      const duplicate = await deliver(job.id);
      expect(await duplicate.json()).toEqual({ outcome: "skipped" });
      expect(materialStorage.reads).toHaveLength(2); // complete + the single worker read
    } finally {
      release();
    }
    expect((await first).status).toBe(200);
    materialStorage.beforeRead = undefined;
    const before = await storedChunks(created.material.id);
    expect(before.length).toBeGreaterThan(0);
    expect(await (await deliver(job.id)).json()).toEqual({
      outcome: "skipped",
    });
    expect(await storedChunks(created.material.id)).toEqual(before);
    expect((await f!.jobFor(created.material.id)).step).toBe("embed");
  });

  it("SEC-JOB-02: live lease skips, expired lease recovers with a fresh fenced claim", async () => {
    const { created, job } = await prepared();
    await db
      .update(jobs)
      .set({
        status: "running",
        claimToken: randomUUID(),
        leaseUntil: new Date(Date.now() + 60_000),
      })
      .where(eq(jobs.id, job.id));
    expect(await (await deliver(job.id)).json()).toEqual({
      outcome: "skipped",
    });
    expect(await storedChunks(created.material.id)).toHaveLength(0);
    await db
      .update(jobs)
      .set({ leaseUntil: new Date(Date.now() - 60_000) })
      .where(eq(jobs.id, job.id));
    expect((await deliver(job.id)).status).toBe(200);
    expect((await storedChunks(created.material.id)).length).toBeGreaterThan(0);
    expect((await f!.jobFor(created.material.id)).claimToken).toBeNull();
  });

  it("SEC-JOB-02: a stale claim cannot commit even after successful extraction", async () => {
    const { created, job } = await prepared();
    const staleToken = randomUUID();
    const [claimed] = await db
      .update(jobs)
      .set({
        status: "running",
        claimToken: staleToken,
        leaseUntil: new Date(Date.now() + 60_000),
      })
      .where(eq(jobs.id, job.id))
      .returning();
    materialStorage.beforeRead = async () => {
      await db
        .update(jobs)
        .set({ claimToken: randomUUID() })
        .where(eq(jobs.id, job.id));
    };
    const publishedBefore = f!.published.length;
    await processMaterialJob.run(claimed);
    expect(await storedChunks(created.material.id)).toHaveLength(0);
    expect((await f!.jobFor(created.material.id)).step).toBe("extract");
    expect(f!.published).toHaveLength(publishedBefore);
  });

  it("SEC-JOB-03: unreadable storage exhausts the actual budget, then explicit Retry reuses the job", async () => {
    const { created, job } = await prepared();
    materialStorage.objects.delete(created.upload.pathname);
    for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt++) {
      const response = await deliver(job.id);
      expect(response.status).toBe(attempt < MAX_STEP_ATTEMPTS ? 503 : 200);
      expect((await f!.jobFor(created.material.id)).attemptCount).toBe(attempt);
    }
    expect((await f!.row(created.material.id))?.status).toBe("failed");
    materialStorage.objects.set(
      created.upload.pathname,
      Buffer.from("A recovered synthetic file with readable lecture text."),
    );
    const restarted = await retry(
      materialRequest(
        `/api/materials/${created.material.id}/retry`,
        "POST",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(restarted.status).toBe(202);
    const reset = await f!.jobFor(created.material.id);
    expect(reset.id).toBe(job.id);
    expect(reset.attemptCount).toBe(0);
    expect(reset.step).toBe("extract");
    expect((await deliver(job.id)).status).toBe(200);
    expect((await storedChunks(created.material.id)).length).toBeGreaterThan(0);
  });

  it("SEC-JOB-03: permanent no-text failure stops delivery and a live material cannot Retry", async () => {
    const created = await f!.create();
    expect((await f!.complete(created, Buffer.from(" \t\n"))).status).toBe(200);
    const job = await f!.jobFor(created.material.id);
    const invalid = await retry(
      materialRequest(
        `/api/materials/${created.material.id}/retry`,
        "POST",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(invalid.status).toBe(409);
    expect((await deliver(job.id)).status).toBe(200);
    expect((await f!.row(created.material.id))?.errorCode).toBe(
      "NO_READABLE_TEXT",
    );
    expect((await f!.jobFor(created.material.id)).status).toBe("failed");
    expect(await storedChunks(created.material.id)).toHaveLength(0);
    expect(await (await deliver(job.id)).json()).toEqual({
      outcome: "skipped",
    });
  });

  it("SEC-JOB-03: publish failure leaves explicit retryable state rather than a second job", async () => {
    const created = await f!.create();
    f!.failPublishing(true);
    expect(
      (
        await f!.complete(
          created,
          Buffer.from("Readable synthetic database material."),
        )
      ).status,
    ).toBe(200);
    const job = await f!.jobFor(created.material.id);
    expect(job.errorCode).toBe("PUBLISH_FAILED");
    expect((await f!.row(created.material.id))?.status).toBe("failed");
    f!.failPublishing(false);
    expect(
      (
        await retry(
          materialRequest(
            `/api/materials/${created.material.id}/retry`,
            "POST",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(202);
    expect((await f!.jobFor(created.material.id)).id).toBe(job.id);
  });

  it("SEC-DELETE-01: deleting a material during an in-flight read cannot resurrect its chunks", async () => {
    const { created, job } = await prepared();
    materialStorage.beforeRead = async () => {
      expect(
        (
          await remove(
            materialRequest(
              `/api/materials/${created.material.id}`,
              "DELETE",
              f!.a.cookie,
            ),
            materialContext(created.material.id),
          )
        ).status,
      ).toBe(204);
    };
    expect((await deliver(job.id)).status).toBe(200);
    expect(await f!.row(created.material.id)).toBeUndefined();
    expect(await storedChunks(created.material.id)).toHaveLength(0);
    expect((await f!.jobFor(created.material.id)).errorCode).toBe(
      "MATERIAL_GONE",
    );
  });
});
