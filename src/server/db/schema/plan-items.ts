import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { materials } from "./materials";
import { studySets } from "./study-sets";
import { studySpaces } from "./study-spaces";
import { topics } from "./topics";

/**
 * One item in a student's own study plan (T-15; PRD Section 2 "My Plan and
 * reviewing mistakes", Section 4 table 14). Replaces the app-set revision
 * schedule after lecturer feedback on 13 November 2026: the app suggests,
 * the student decides.
 *
 * `planned_on` is a plain calendar day the student picked, never compared
 * with "today". There is no stored URL: the link is built on the server from
 * `kind` and the ids, so a request can't plant an outside or `javascript:`
 * link. When a target is deleted its id becomes null and the item keeps its
 * title but loses its link. Items in a soft-deleted Study Space are never
 * returned (the retention policy: a deleted space keeps no history).
 */
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    spaceId: uuid("space_id").references(() => studySpaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    setId: uuid("set_id").references(() => studySets.id, { onDelete: "set null" }),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    plannedOn: date("planned_on", { mode: "string" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("plan_items_student_id_idx").on(table.studentId),
    check("plan_items_kind_valid", sql`${table.kind} in ('own', 'practise_topic', 'review_mistakes', 'resume_quiz', 'review_topics', 'practise_deck')`),
    check("plan_items_title_length", sql`char_length(${table.title}) between 1 and 120`),
  ],
);
