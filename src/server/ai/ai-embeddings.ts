import { embedMany } from "ai";
import { embedModel } from "./ai-client";

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

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) throw new Error("Cannot normalise a zero vector.");
  return vector.map((x) => x / norm);
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType,
): Promise<{ vectors: number[][]; tokens: number | undefined }> {
  const { embeddings, usage } = await embedMany({
    model: embedModel(),
    values: texts,
    providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } },
    // ponytail: one SDK retry for now; T-08b moves retries to delayed QStash
    // deliveries with a single total budget (PRD Section 3, "Failures and retries").
    maxRetries: 1,
  });
  for (const e of embeddings) {
    if (e.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${e.length}.`);
    }
  }
  return { vectors: embeddings.map(l2Normalize), tokens: usage?.tokens };
}
