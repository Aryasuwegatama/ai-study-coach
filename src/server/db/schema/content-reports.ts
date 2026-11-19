import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { learningItems } from "./study-sets";

/**
 * Report an issue (T-12b; PRD Section 2 "Reports", Section 4 table 14).
 * One report per student per question, never edited or withdrawn in Core
 * (`src/features/reports/reports-schemas.ts` is the contract routes
 * follow). "Remove from my practice" sets the reported `learning_items`
 * row's `status` to `removed` in the same transaction as the insert here;
 * generation, attempts, mastery and revision already filter on
 * `status = 'active'`, so nothing else has to know about this table.
 */
export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull(),
    itemId: uuid("item_id").notNull(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    comment: text("comment"),
    removedFromPractice: boolean("removed_from_practice").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "content_reports_item_space_fk",
      columns: [table.itemId, table.spaceId],
      foreignColumns: [learningItems.id, learningItems.spaceId],
    }).onDelete("cascade"),
    unique("content_reports_reporter_id_item_id_unique").on(table.reporterId, table.itemId),
    check(
      "content_reports_reason_valid",
      sql`${table.reason} in ('incorrect_answer', 'unclear_wording', 'wrong_source', 'other')`,
    ),
  ],
);
