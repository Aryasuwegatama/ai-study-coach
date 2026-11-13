import { and, asc, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { chunks } from "@/server/db/schema";
import { embeddingModelName } from "@/server/ai/ai-embeddings";

/**
 * RAG retrieval (PRD Section 3, Pipeline B step 2): the chunks closest in
 * meaning to a query vector, only from one Study Space and the chosen
 * materials, and only vectors from the current embedding model. Callers
 * pass a space they have already checked the owner of.
 *
 * ponytail: exact scan, no vector index. Fine for 20 materials of at most
 * a few hundred chunks each; add an HNSW index when p95 says so (PRD
 * Section 4, "Indexes").
 */
export type RetrievedChunk = {
  id: string;
  materialId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  distance: number;
};

export async function searchChunks(options: {
  spaceId: string;
  materialIds: string[];
  queryVector: number[];
  limit: number;
}): Promise<RetrievedChunk[]> {
  if (options.materialIds.length === 0) return [];
  const distance = cosineDistance(chunks.embedding, options.queryVector);
  return db
    .select({
      id: chunks.id,
      materialId: chunks.materialId,
      content: chunks.content,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
      distance: sql<number>`${distance}`.mapWith(Number),
    })
    .from(chunks)
    .where(
      and(
        eq(chunks.spaceId, options.spaceId),
        inArray(chunks.materialId, options.materialIds),
        isNotNull(chunks.embedding),
        eq(chunks.embeddingModel, embeddingModelName()),
      ),
    )
    .orderBy(asc(distance), asc(chunks.id))
    .limit(options.limit);
}
