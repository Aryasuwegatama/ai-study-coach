import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { learningItems, studySets } from "./study-sets";
import { topics } from "./topics";

/**
 * Quiz attempts, scoring and revision (T-14; PRD Section 4, tables 9–13).
 * Mastery is a query over these, not a table (`features/progress`).
 */
export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull(),
    setId: uuid("set_id").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"),
    /** Server-scored on submit; never taken from the request. */
    score: integer("score"),
    total: integer("total").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "attempts_set_space_fk",
      columns: [table.setId, table.spaceId],
      foreignColumns: [studySets.id, studySets.spaceId],
    }).onDelete("cascade"),
    unique("attempts_id_space_id_set_id_unique").on(table.id, table.spaceId, table.setId),
    // One in-progress attempt per student per quiz (Resume quiz).
    uniqueIndex("attempts_one_in_progress").on(table.setId, table.studentId).where(sql`${table.status} = 'in_progress'`),
    index("attempts_student_id_idx").on(table.studentId),
    check("attempts_status_valid", sql`${table.status} in ('in_progress', 'submitted')`),
  ],
);

/**
 * One question in one attempt. `option_order[d]` is the stored option
 * shown at display position `d`; `selected_index` is a stored (original)
 * index, so scoring compares it with `learning_items.correct_index`.
 */
export const attemptItems = pgTable(
  "attempt_items",
  {
    attemptId: uuid("attempt_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    setId: uuid("set_id").notNull(),
    itemId: uuid("item_id").notNull(),
    position: integer("position").notNull(),
    optionOrder: smallint("option_order").array().notNull(),
    selectedIndex: smallint("selected_index"),
    isCorrect: boolean("is_correct"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.itemId] }),
    // Both ends in the same quiz: an item from another set is rejected by Postgres.
    foreignKey({
      name: "attempt_items_attempt_fk",
      columns: [table.attemptId, table.spaceId, table.setId],
      foreignColumns: [attempts.id, attempts.spaceId, attempts.setId],
    }).onDelete("cascade"),
    foreignKey({
      name: "attempt_items_item_fk",
      columns: [table.itemId, table.spaceId, table.setId],
      foreignColumns: [learningItems.id, learningItems.spaceId, learningItems.setId],
    }).onDelete("cascade"),
    unique("attempt_items_attempt_id_position_unique").on(table.attemptId, table.position),
    index("attempt_items_item_id_idx").on(table.itemId),
    check("attempt_items_selected_valid", sql`${table.selectedIndex} is null or ${table.selectedIndex} between 0 and 3`),
  ],
);

/** A question (or, later, card) scheduled for review. Dates are the student's local calendar days. */
export const revisionItems = pgTable(
  "revision_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").notNull(),
    itemId: uuid("item_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    intervalDays: integer("interval_days").notNull().default(1),
    streak: integer("streak").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("revision_items_student_id_item_id_unique").on(table.studentId, table.itemId),
    foreignKey({
      name: "revision_items_item_space_fk",
      columns: [table.itemId, table.spaceId],
      foreignColumns: [learningItems.id, learningItems.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "revision_items_topic_space_fk",
      columns: [table.topicId, table.spaceId],
      foreignColumns: [topics.id, topics.spaceId],
    }).onDelete("cascade"),
    index("revision_items_student_id_due_date_idx").on(table.studentId, table.dueDate),
  ],
);

/** One review. The request key makes a double click move the schedule once and return the same result. */
export const revisionEvents = pgTable(
  "revision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionItemId: uuid("revision_item_id")
      .notNull()
      .references(() => revisionItems.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    requestKey: text("request_key").notNull(),
    selectedIndex: smallint("selected_index"),
    intervalBefore: integer("interval_before").notNull(),
    intervalAfter: integer("interval_after").notNull(),
    dueDateAfter: date("due_date_after", { mode: "string" }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Scoped to the item, so one student's key can never return another's event.
    unique("revision_events_item_request_key_unique").on(table.revisionItemId, table.requestKey),
    check("revision_events_outcome_valid", sql`${table.outcome} in ('correct', 'incorrect', 'again', 'got_it')`),
  ],
);
