import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { chunks } from "./chunks";
import { studySpaces } from "./study-spaces";
import { topics } from "./topics";

/**
 * Quizzes (and, later, flashcard decks) with their items and sources
 * (T-11a; PRD Section 4, tables 6–8). The contract the routes follow is
 * `src/features/quizzes/quizzes-schemas.ts`.
 */
export const studySets = pgTable(
  "study_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => studySpaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    cardStyle: text("card_style"),
    materialIds: uuid("material_ids").array().notNull(),
    topicIds: uuid("topic_ids").array().notNull(),
    requestedCount: integer("requested_count").notNull(),
    generatedCount: integer("generated_count").notNull().default(0),
    status: text("status").notNull().default("generating"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("study_sets_id_space_id_unique").on(table.id, table.spaceId),
    index("study_sets_space_id_kind_idx").on(table.spaceId, table.kind),
    check("study_sets_kind_valid", sql`${table.kind} in ('quiz', 'deck')`),
    check("study_sets_status_valid", sql`${table.status} in ('generating', 'ready', 'failed')`),
    check("study_sets_card_style_valid", sql`${table.cardStyle} is null or ${table.cardStyle} in ('recall', 'short_answer', 'mix')`),
  ],
);

/**
 * One question or card. Published scoring data (prompt, options, correct
 * index) is never updated; a reported item becomes `removed` instead.
 */
export const learningItems = pgTable(
  "learning_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    kind: text("kind").notNull(),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    /** MCQ: exactly four option strings, in published order. */
    options: jsonb("options").$type<string[]>(),
    /** MCQ: index into `options`; server-owned, never sent before submission. */
    correctIndex: smallint("correct_index"),
    answerText: text("answer_text"),
    keyPoints: jsonb("key_points").$type<string[]>(),
    explanation: text("explanation"),
    difficulty: text("difficulty"),
    /** Lower case, punctuation removed: the duplicate check (PRD Section 3, Pipeline B step 4). */
    normalizedPrompt: text("normalized_prompt").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "learning_items_set_space_fk",
      columns: [table.setId, table.spaceId],
      foreignColumns: [studySets.id, studySets.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_items_topic_space_fk",
      columns: [table.topicId, table.spaceId],
      foreignColumns: [topics.id, topics.spaceId],
      // Topics are archived, never deleted, so this only fires when the
      // whole space goes (otherwise it would block the space's cascade).
    }).onDelete("cascade"),
    unique("learning_items_id_space_id_unique").on(table.id, table.spaceId),
    unique("learning_items_id_space_id_set_id_unique").on(table.id, table.spaceId, table.setId),
    unique("learning_items_set_id_position_unique").on(table.setId, table.position),
    index("learning_items_topic_id_idx").on(table.topicId),
    check("learning_items_kind_valid", sql`${table.kind} in ('mcq', 'recall', 'short_answer')`),
    check("learning_items_status_valid", sql`${table.status} in ('active', 'removed')`),
    check(
      "learning_items_mcq_shape",
      sql`${table.kind} <> 'mcq' or (jsonb_array_length(${table.options}) = 4 and ${table.correctIndex} between 0 and 3)`,
    ),
    check("learning_items_difficulty_valid", sql`${table.difficulty} is null or ${table.difficulty} in ('easy', 'medium', 'hard')`),
  ],
);

/**
 * The chunks an item cites. Both ends are in the same space (composite
 * FKs). Deleting a material deletes its chunks and so these links; an item
 * left with none shows "Source removed" in past results.
 */
export const itemSources = pgTable(
  "item_sources",
  {
    spaceId: uuid("space_id").notNull(),
    itemId: uuid("item_id").notNull(),
    chunkId: uuid("chunk_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.chunkId] }),
    foreignKey({
      name: "item_sources_item_space_fk",
      columns: [table.itemId, table.spaceId],
      foreignColumns: [learningItems.id, learningItems.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "item_sources_chunk_space_fk",
      columns: [table.chunkId, table.spaceId],
      foreignColumns: [chunks.id, chunks.spaceId],
    }).onDelete("cascade"),
    index("item_sources_chunk_id_idx").on(table.chunkId),
  ],
);
