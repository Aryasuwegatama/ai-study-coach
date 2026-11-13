import { z } from "zod";

/**
 * Topics API contract (T-08b; PRD Section 2 "Topics", Section 4 API table).
 * Arya's topic review screens (T-09c) build against this file.
 *
 * Routes:
 * - `GET /api/spaces/:spaceId/topics` → `{ topics: TopicResponse[] }`:
 *   confirmed topics only (PRD: topic lists show confirmed topics), A–Z.
 *   `?include=archived` adds archived ones.
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
 *   `status: "archived" | "confirmed"`. Topics are never deleted.
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
