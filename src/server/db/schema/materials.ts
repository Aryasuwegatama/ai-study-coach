import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { studySpaces } from "./study-spaces";

/**
 * An uploaded file in a Study Space (T-06b; PRD Section 4, table 2). The
 * contract every route follows lives in
 * `src/features/materials/materials-schemas.ts`.
 *
 * No `deleted_at` (Arya, 2026-11-13, issue #24): deleting a material
 * removes its Blob file first, then this row, in one request. Rows delete
 * with their Study Space (`onDelete: "cascade"`), so whoever deletes a
 * space or account for real must delete the Blob files first.
 *
 * `id` is generated in code, not by the database, because the Blob
 * pathname is built from it before the insert.
 */
export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => studySpaces.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    blobPath: text("blob_path").notNull().unique(),
    /** SHA-256 hex; null until "complete" has checked the file. */
    fileHash: text("file_hash"),
    /** The real size measured at "complete", not the browser's claim; null until then. */
    sizeBytes: integer("size_bytes"),
    pageCount: integer("page_count"),
    charCount: integer("char_count"),
    status: text("status").notNull().default("uploading"),
    stage: text("stage"),
    progressDone: integer("progress_done"),
    progressTotal: integer("progress_total"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Duplicate files are rejected even when two "complete" calls race.
    // Postgres treats NULLs as distinct, so rows still uploading never clash.
    unique("materials_space_id_file_hash_unique").on(table.spaceId, table.fileHash),
    // Referenced by later same-space composite FKs (PRD Section 4,
    // "Cross-space integrity").
    unique("materials_id_space_id_unique").on(table.id, table.spaceId),
    check(
      "materials_status_valid",
      sql`${table.status} in ('uploading', 'processing', 'review_topics', 'ready', 'failed')`,
    ),
    check(
      "materials_stage_valid",
      sql`${table.stage} is null or ${table.stage} in ('verify', 'extract', 'embed', 'suggest_topics')`,
    ),
    check(
      "materials_error_code_valid",
      sql`${table.errorCode} is null or ${table.errorCode} in ('NO_READABLE_TEXT', 'TOO_MANY_PAGES', 'TOO_MUCH_TEXT', 'AI_UNUSABLE_ANSWER', 'PROCESSING_FAILED')`,
    ),
    check("materials_original_name_length", sql`char_length(${table.originalName}) between 1 and 255`),
  ],
);

export const materialsRelations = relations(materials, ({ one }) => ({
  space: one(studySpaces, {
    fields: [materials.spaceId],
    references: [studySpaces.id],
  }),
}));
