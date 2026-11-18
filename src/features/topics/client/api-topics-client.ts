import type { MaterialResponse } from "@/features/materials/materials-schemas";
import type { SaveTopicDraftRequest, TopicDraftResponse, TopicResponse, TopicsMaterialsFilter } from "../topics-schemas";

/**
 * T-09c's browser client against the T-08b Topics API (contract in
 * `topics-schemas.ts`), mirroring `api-materials-client.ts`'s request
 * handling and 401 redirect. No `"use server"`, no secrets.
 */

type ErrorBody = { error?: { code?: string; message?: string } };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Carries the stable contract code and message, so callers can show the
 * exact contract message without inspecting strings (mirrors `MaterialsClientError`). */
export class TopicsClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** A 401 means the session is gone; a full navigation also clears any stale client state. */
function goToSignIn(): TopicsClientError {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above
  if (typeof window !== "undefined") window.location.href = "/sign-in";
  return new TopicsClientError("UNAUTHORIZED", "Your session has expired. Sign in again.");
}

async function errorFromResponse(response: Response): Promise<TopicsClientError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new TopicsClientError(body.error?.code ?? "VALIDATION_ERROR", body.error?.message ?? GENERIC_ERROR_MESSAGE);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) throw goToSignIn();
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const topicsClient = {
  async getDraft(materialId: string): Promise<TopicDraftResponse> {
    return requestJson<TopicDraftResponse>(`/api/materials/${materialId}/topic-draft`);
  },

  async saveDraft(materialId: string, topics: SaveTopicDraftRequest["topics"]): Promise<TopicDraftResponse> {
    return requestJson<TopicDraftResponse>(`/api/materials/${materialId}/topic-draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topics }),
    });
  },

  async confirm(materialId: string): Promise<{ material: MaterialResponse; topics: TopicResponse[] }> {
    return requestJson(`/api/materials/${materialId}/topic-draft/confirm`, { method: "POST" });
  },

  async list(
    spaceId: string,
    options?: { includeArchived?: boolean; materials?: TopicsMaterialsFilter },
  ): Promise<TopicResponse[]> {
    const params = new URLSearchParams();
    if (options?.includeArchived) params.set("include", "archived");
    if (options?.materials && options.materials !== "any") params.set("materials", options.materials);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const data = await requestJson<{ topics: TopicResponse[] }>(`/api/spaces/${spaceId}/topics${query}`);
    return data.topics;
  },

  async update(topicId: string, input: { name?: string; status?: "archived" | "confirmed" }): Promise<TopicResponse> {
    const data = await requestJson<{ topic: TopicResponse }>(`/api/topics/${topicId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return data.topic;
  },
};
