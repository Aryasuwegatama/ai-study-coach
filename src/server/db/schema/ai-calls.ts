import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";

/**
 * One row per AI call (T-08b; PRD Section 4, table 16, and Section 3,
 * "Logging"). Never the prompt or source text. Gemini reports no token
 * usage for embeddings, so those stay null (T-02).
 */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** `embed`, `suggest_topics`, `write_questions`, `check_answers`, `embed_query`. */
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms").notNull(),
    /** `ok`, `invalid_output` or `error`. */
    status: text("status").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_calls_purpose_created_at_idx").on(table.purpose, table.createdAt)],
);
