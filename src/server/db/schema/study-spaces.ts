import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * A student's private Study Space (T-05; PRD Section 4, table 1). Owned by
 * exactly one student; everything inside it (future materials, topics,
 * quizzes, …) is scoped to `space_id` and only ever visible to its owner —
 * enforced here by `requireSpace()` (src/server/auth/auth-space-access.ts),
 * never by a client-supplied owner ID.
 *
 * `deleted_at` is a soft delete (Arya, 2026-11-08): deleting sets this
 * column rather than removing the row. From the moment it's set, the space
 * behaves exactly like one that doesn't exist — every query in this
 * feature filters on `deleted_at IS NULL`. Permanent removal and Blob
 * cleanup are built with materials (T-06b and the daily cleanup job), not
 * here. See the privacy policy's "Deleting your data" section for the
 * retention policy this implies.
 */
export const studySpaces = pgTable(
  "study_spaces",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("study_spaces_owner_id_idx").on(table.ownerId),
    // Database-enforced backstop for the Zod schema's 1-150 character rule
    // (PRD Section 2: "A name is required (1-150 characters)") — a direct
    // insert that bypasses the service is rejected too.
    check("study_spaces_name_length", sql`char_length(${table.name}) between 1 and 150`),
  ],
);

export const studySpacesRelations = relations(studySpaces, ({ one }) => ({
  owner: one(user, {
    fields: [studySpaces.ownerId],
    references: [user.id],
  }),
}));
