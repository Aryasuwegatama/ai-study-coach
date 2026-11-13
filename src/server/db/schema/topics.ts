import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { materials } from "./materials";
import { studySpaces } from "./study-spaces";

/**
 * Topics in a Study Space (T-08b; PRD Section 4, table 4). A `draft` topic
 * belongs to the one material whose suggestions it came from (through
 * `material_topics`) until the student confirms it; confirming either
 * makes it `confirmed` or links the material to an existing confirmed
 * topic with the same normalised name, and deletes the draft.
 */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => studySpaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lower case with every space removed: "Primary Keys" = "primarykeys" (PRD Section 2). */
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    origin: text("origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("topics_id_space_id_unique").on(table.id, table.spaceId),
    // No duplicate confirmed topics; drafts and archived ones may repeat.
    uniqueIndex("topics_space_confirmed_name_unique")
      .on(table.spaceId, table.normalizedName)
      .where(sql`${table.status} = 'confirmed'`),
    check("topics_status_valid", sql`${table.status} in ('draft', 'confirmed', 'archived')`),
    check("topics_origin_valid", sql`${table.origin} in ('ai', 'manual')`),
    check("topics_name_length", sql`char_length(${table.name}) between 1 and 60`),
    check("topics_description_length", sql`char_length(${table.description}) <= 200`),
  ],
);

/**
 * Which material covers which topic, and on which pages (table 5). The
 * composite FKs keep both ends in the same Study Space and delete the link
 * with either end.
 */
export const materialTopics = pgTable(
  "material_topics",
  {
    spaceId: uuid("space_id").notNull(),
    materialId: uuid("material_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    pages: integer("pages").array().notNull().default(sql`'{}'::integer[]`),
  },
  (table) => [
    primaryKey({ columns: [table.materialId, table.topicId] }),
    foreignKey({
      name: "material_topics_material_space_fk",
      columns: [table.materialId, table.spaceId],
      foreignColumns: [materials.id, materials.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "material_topics_topic_space_fk",
      columns: [table.topicId, table.spaceId],
      foreignColumns: [topics.id, topics.spaceId],
    }).onDelete("cascade"),
    index("material_topics_topic_id_idx").on(table.topicId),
  ],
);
