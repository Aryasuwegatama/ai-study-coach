import { foreignKey, index, integer, pgTable, text, unique, uuid, vector } from "drizzle-orm/pg-core";
import { materials } from "./materials";

/**
 * One packed piece of a material's text, with the pages or slides it came
 * from (T-08a; PRD Section 4, table 3, and Section 3, Pipeline A step 4).
 *
 * The composite FK to `materials (id, space_id)` keeps a chunk in its
 * material's space and deletes it with the material (issue #24: anything
 * hanging off a material deletes with it).
 *
 * `embedding` and `embedding_model` stay null until T-08b embeds the chunk
 * (768-D, L2-normalised `gemini-embedding-001`; T-02).
 */
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    embeddingModel: text("embedding_model"),
  },
  (table) => [
    foreignKey({
      name: "chunks_material_space_fk",
      columns: [table.materialId, table.spaceId],
      foreignColumns: [materials.id, materials.spaceId],
    }).onDelete("cascade"),
    unique("chunks_material_id_chunk_index_unique").on(table.materialId, table.chunkIndex),
    // Referenced by `item_sources (chunk_id, space_id)` later (PRD Section 4).
    unique("chunks_id_space_id_unique").on(table.id, table.spaceId),
    index("chunks_space_id_material_id_idx").on(table.spaceId, table.materialId),
  ],
);
