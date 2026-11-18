import { z } from "zod";

/**
 * Topics API contract (T-08b; PRD Section 2 "Topics", Section 4 API table).
 * Arya's topic review screens (T-09c) build against this file.
 *
 * Routes:
 * - `GET /api/spaces/:spaceId/topics` → `{ topics: TopicResponse[] }`:
 *   confirmed topics only (PRD: topic lists show confirmed topics), A–Z.
 *   `?include=archived` adds archived ones. `?materials=linked|unlinked`
 *   narrows to topics that do, or don't, have any `material_topics` row
 *   (T-09c, Arya 2026-11-18: a topic with no linked material — e.g. its
 *   last material was deleted — stays confirmed and keeps its history,
 *   relinking automatically when a material with the same name is next
 *   confirmed; the Overview lists it separately). Default `any`. An
 *   unrecognised value is 400 `VALIDATION_ERROR`.
 * - `POST /api/spaces/:spaceId/topics` `{ name, description? }` → 201
 *   `{ topic }`: a manual, confirmed topic. Same name as a confirmed topic
 *   (ignoring case and spaces): 409 `TOPIC_EXISTS`.
 * - `GET /api/materials/:id/topic-draft` → `TopicDraftResponse`. Only while
 *   the material is `review_topics`; otherwise 409 `INVALID_MATERIAL_STATE`.
 * - `PUT /api/materials/:id/topic-draft` `SaveTopicDraftRequest` → the
 *   saved draft ("Save & exit"). Replaces the whole list: rename, remove
 *   or add. An item with the `id` of an existing draft topic keeps its
 *   AI-suggested origin and pages; anything else is `manual`.
 * - `POST /api/materials/:id/topic-draft/confirm` → `{ material, topics }`:
 *   every draft topic becomes confirmed, or links to the confirmed topic
 *   with the same normalised name (no duplicate). The material becomes
 *   `ready`. An empty draft: 400 `TOPIC_DRAFT_EMPTY`.
 * - `PATCH /api/topics/:id` `{ name? , status? }` → `{ topic }`: rename
 *   (history and mastery stay with the id) or archive/restore with
 *   `status: "archived" | "confirmed"`. This route never deletes a topic.
 *
 * A topic is deleted only together with its last material, and only if
 * no quiz or flashcard item was ever generated for it and no quiz lists
 * it; otherwise it stays (confirmed or archived) with its history (Arya,
 * 2026-11-19, T-09c — see `deleteMaterial()` in materials-service.ts).
 *
 * Errors use the shared shape; a missing or someone else's topic gives
 * 404 `TOPIC_NOT_FOUND`, materials give `MATERIAL_NOT_FOUND`.
 */

export const MAX_TOPIC_NAME = 60;
export const MAX_TOPIC_DESCRIPTION = 200;
export const MAX_DRAFT_TOPICS = 30;

export const TOPIC_API_ERRORS = {
  TOPIC_NOT_FOUND: { status: 404, message: "Topic not found." },
  TOPIC_EXISTS: { status: 409, message: "This topic is already in this space." },
  TOPIC_DRAFT_EMPTY: { status: 400, message: "Keep at least one topic before confirming." },
} as const;
export type TopicApiErrorCode = keyof typeof TOPIC_API_ERRORS;

/** `GET /api/spaces/:spaceId/topics`'s `?materials=` filter (T-09c). */
export const TOPICS_MATERIALS_FILTERS = ["linked", "unlinked", "any"] as const;
export type TopicsMaterialsFilter = (typeof TOPICS_MATERIALS_FILTERS)[number];

/** Missing is the default `"any"`; an unrecognised value is `null`, so
 * the route can give its own 400 `VALIDATION_ERROR` (the same pattern as
 * `parseCreateMaterialRequest`: this file stays dependency-free). */
export function parseTopicsMaterialsFilter(value: string | null): TopicsMaterialsFilter | null {
  if (value === null) return "any";
  return (TOPICS_MATERIALS_FILTERS as readonly string[]).includes(value) ? (value as TopicsMaterialsFilter) : null;
}

const topicName = z
  .string({ error: "Enter a topic name." })
  .trim()
  .min(1, "Enter a topic name.")
  .max(MAX_TOPIC_NAME, `Use ${MAX_TOPIC_NAME} characters or fewer.`);
const topicDescription = z
  .string()
  .trim()
  .max(MAX_TOPIC_DESCRIPTION, `Use ${MAX_TOPIC_DESCRIPTION} characters or fewer for the description.`);

export const createTopicSchema = z.object({ name: topicName, description: topicDescription.default("") });

export const updateTopicSchema = z
  .object({ name: topicName.optional(), status: z.enum(["archived", "confirmed"]).optional() })
  .refine((v) => v.name !== undefined || v.status !== undefined, "Send a new name or status.");

export const saveTopicDraftSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().optional(),
        name: topicName,
        description: topicDescription.default(""),
      }),
    )
    .max(MAX_DRAFT_TOPICS, `Keep ${MAX_DRAFT_TOPICS} topics or fewer.`),
});
export type SaveTopicDraftRequest = z.infer<typeof saveTopicDraftSchema>;

export type TopicResponse = {
  id: string;
  name: string;
  description: string;
  status: "confirmed" | "archived";
  /** `ai`: the AI suggested it (show the AI-suggested label until confirmed). */
  origin: "ai" | "manual";
  createdAt: string;
  updatedAt: string;
};

export type DraftTopicResponse = {
  id: string;
  name: string;
  description: string;
  origin: "ai" | "manual";
  /** Pages, slides or sections where the AI found it; empty for manual topics. */
  pages: number[];
  /** A confirmed topic with the same name: "Already in this space — will be linked". */
  existingTopicId: string | null;
};

export type TopicDraftResponse = { materialId: string; topics: DraftTopicResponse[] };
