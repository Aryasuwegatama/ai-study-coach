import type { CheckRequest, CheckResult, MistakesResponse } from "@/features/revision/revision-schemas";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import type { CreatePlanItemRequest, PlanItemResponse, Suggestion, UpdatePlanItemRequest } from "../plan-schemas";
import { PlanClientError, type MistakesScope, type PlanClient } from "./plan-client";

/**
 * The real `PlanClient`, against the live revision (mistakes) and plan
 * routes (T-15; mirrors `api-quizzes-client.ts`'s request handling and 401
 * redirect). Runs entirely in the browser: no `"use server"`, no secrets.
 */

type ErrorBody = { error?: { code?: string; message?: string } };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** A 401 means the session is gone; a full navigation also clears any stale client state. */
function goToSignIn(): PlanClientError {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full navigation clears stale client state
  if (typeof window !== "undefined") window.location.href = "/sign-in";
  return new PlanClientError("UNAUTHORIZED", "Your session has expired. Sign in again.");
}

async function errorFromResponse(response: Response): Promise<PlanClientError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new PlanClientError(body.error?.code ?? "VALIDATION_ERROR", body.error?.message ?? GENERIC_ERROR_MESSAGE);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) throw goToSignIn();
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function createApiPlanClient(): PlanClient {
  return {
    async listMistakes(scope: MistakesScope) {
      const query = "topicId" in scope ? `topicId=${encodeURIComponent(scope.topicId)}` : `spaceId=${encodeURIComponent(scope.spaceId)}`;
      // `no-store`: a review must always show the student's current mistakes, never a cached list.
      return requestJson<MistakesResponse>(`/api/revision/mistakes?${query}`, { cache: "no-store" });
    },

    async checkMistake(revisionItemId: string, request: CheckRequest) {
      const data = await requestJson<{ result: CheckResult }>(`/api/revision/items/${revisionItemId}/check`, jsonInit("POST", request));
      return data.result;
    },

    async listItems() {
      const data = await requestJson<{ items: PlanItemResponse[] }>(`/api/plan/items`, { cache: "no-store" });
      return data.items;
    },

    async createItem(request: CreatePlanItemRequest) {
      const data = await requestJson<{ item: PlanItemResponse }>(`/api/plan/items`, jsonInit("POST", request));
      return data.item;
    },

    async updateItem(itemId: string, request: UpdatePlanItemRequest) {
      const data = await requestJson<{ item: PlanItemResponse }>(`/api/plan/items/${itemId}`, jsonInit("PATCH", request));
      return data.item;
    },

    async deleteItem(itemId: string) {
      await requestJson<void>(`/api/plan/items/${itemId}`, { method: "DELETE" });
    },

    async listSuggestions() {
      const data = await requestJson<{ suggestions: Suggestion[] }>(`/api/plan/suggestions`, { cache: "no-store" });
      return data.suggestions;
    },

    async listSpaces() {
      const data = await requestJson<{ spaces: SpaceResponse[] }>(`/api/spaces`, { cache: "no-store" });
      return data.spaces;
    },
  };
}
