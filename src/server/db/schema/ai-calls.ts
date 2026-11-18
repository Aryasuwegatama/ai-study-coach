import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";

/**
 * One row per AI call (T-08b; PRD Section 4, table 16, and Section 3,
 * "Logging"). Never the prompt or source text. `model` holds a Vercel AI
 * Gateway model ID from T-02b onward (for example `openai/gpt-5-nano`),
 * and `error_code` can be `TIMEOUT` (T-02b's per-call time limit) alongside
 * the existing codes. Embedding calls record their input tokens (the
 * gateway reports them; direct Gemini didn't, so pre-T-02b embedding rows
 * have null tokens), and have no output tokens.
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
