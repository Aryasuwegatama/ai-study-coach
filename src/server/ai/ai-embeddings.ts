import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { serverEnv } from "@/lib/server-env";
import { embedModel } from "./ai-client";
import { isFakeAI, logAICall } from "./call-ai";

/**
 * 768-D Gemini embeddings, L2-normalised (T-02; PRD Section 3, Pipeline A
 * step 5). `gemini-embedding-001` only returns unit vectors at its default
 * 3,072 dimensions, so a truncated 768-D vector must be normalised by hand
 * before it's stored or compared.
 *
 * Callers pass at most one bounded step of texts (PRD: 50 chunks); the SDK
 * sends up to 100 per provider request, so a step is a single request.
 */
export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Stored with every chunk vector; vectors from another model are never mixed. */
export function embeddingModelName(): string {
  return isFakeAI() ? "fake-hashed-words" : serverEnv().AI_MODEL_EMBED;
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) throw new Error("Cannot normalise a zero vector.");
  return vector.map((x) => x / norm);
}

/**
 * The fake provider's vectors: words hashed into 768 buckets, so texts that
 * share words are close. Good enough for retrieval tests without quota.
 */
function fakeVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? ["empty"]) {
    vector[createHash("sha1").update(word).digest().readUInt16BE(0) % EMBEDDING_DIMENSIONS] += 1;
  }
  return l2Normalize(vector);
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType,
  log?: { jobId: string | null; purpose: string },
): Promise<{ vectors: number[][]; tokens: number | undefined }> {
  const started = Date.now();
  const record = (status: string, errorCode: string | null) =>
    log
      ? logAICall({
          jobId: log.jobId,
          purpose: log.purpose,
          model: embeddingModelName(),
          latencyMs: Date.now() - started,
          status,
          errorCode,
        })
      : Promise.resolve();

  if (isFakeAI()) {
    await record("ok", null);
    return { vectors: texts.map(fakeVector), tokens: undefined };
  }
  try {
    const { embeddings, usage } = await embedMany({
      model: embedModel(),
      values: texts,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } },
      // One retry budget per job step lives in the queue (PRD Section 3).
      maxRetries: 0,
    });
    for (const e of embeddings) {
      if (e.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${e.length}.`);
      }
    }
    await record("ok", null);
    return { vectors: embeddings.map(l2Normalize), tokens: usage?.tokens };
  } catch (error) {
    await record("error", "CALL_FAILED");
    throw error;
  }
}
