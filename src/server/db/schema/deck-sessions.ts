import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { studySets } from "./study-sets";

/**
 * One student's practice of a flashcard deck (T-18; PRD Section 4, table 11).
 * `ratings` maps a card id to `again` or `got_it`; a rating is saved when the
 * student presses Next, so leaving mid-deck keeps progress. Ratings are
 * self-assessment only: nothing here feeds mastery, mistakes or any schedule.
 * Deleting the deck deletes its sessions.
 */
export const deckSessions = pgTable(
  "deck_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull(),
    setId: uuid("set_id").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"),
    /** `learning_items.position` just after the last rated card; only ever moves forward. */
    currentPosition: integer("current_position").notNull().default(0),
    ratings: jsonb("ratings").$type<Record<string, "again" | "got_it">>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Last rating (or the start): the dashboard's Resume card picks the most recently touched quiz or deck. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "deck_sessions_set_space_fk",
      columns: [table.setId, table.spaceId],
      foreignColumns: [studySets.id, studySets.spaceId],
    }).onDelete("cascade"),
    // One in-progress session per student per deck (Resume practice).
    uniqueIndex("deck_sessions_one_in_progress").on(table.setId, table.studentId).where(sql`${table.status} = 'in_progress'`),
    index("deck_sessions_student_id_idx").on(table.studentId),
    check("deck_sessions_status_valid", sql`${table.status} in ('in_progress', 'completed')`),
    check("deck_sessions_position_valid", sql`${table.currentPosition} >= 0`),
  ],
);
