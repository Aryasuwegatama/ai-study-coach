import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { studySpaces } from "./study-spaces";

/**
 * One row per slow task, moved forward one step at a time by QStash
 * calling `POST /api/jobs/step` (T-08a; PRD Section 4, table 15 and
 * "Background jobs"). The row, not the queue, is the source of truth.
 *
 * `user_id`/`space_id` are nullable and set to null (never cascaded) when
 * their parent goes, so a `delete_files` cleanup job outlives what it
 * cleans up. `target_id` has no FK for the same reason: a
 * `process_material` job whose material was deleted just finishes.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    spaceId: uuid("space_id").references(() => studySpaces.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    targetId: uuid("target_id"),
    /** Restricted: ids and Blob keys only, never file text or prompts. */
    payload: jsonb("payload"),
    status: text("status").notNull().default("queued"),
    step: text("step").notNull(),
    claimToken: uuid("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    generationSlotAcquired: boolean("generation_slot_acquired").notNull().default(false),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: text("error_code"),
    /** One job per key, e.g. `process_material:<material id>`. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // The notification bell and the daily generation limit (PRD Section 4, "Indexes").
    index("jobs_user_id_finished_at_idx").on(table.userId, table.finishedAt),
    index("jobs_user_id_kind_created_at_idx").on(table.userId, table.kind, table.createdAt),
    check(
      "jobs_kind_valid",
      sql`${table.kind} in ('process_material', 'generate_quiz', 'generate_deck', 'delete_files')`,
    ),
    check("jobs_status_valid", sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`),
  ],
);
