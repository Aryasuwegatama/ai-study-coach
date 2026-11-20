import type { CreateDeckRequest, SetDetailResponse, SetResponse } from "@/features/quizzes/quizzes-schemas";
import type { DeckListItemResponse, DeckSessionResponse, RatingResponse } from "../flashcards-schemas";
import { FlashcardsClientError, type FlashcardsClient } from "./flashcards-client";

/**
 * The real `FlashcardsClient`, against the live set, practice and rating
 * routes (same request handling and 401 redirect as `api-quizzes-client.ts`).
 * Runs entirely in the browser: no `"use server"`, no secrets. What a student
 * types into a short-answer card is never sent anywhere: no method takes it.
 */

type ErrorBody = { error?: { code?: string; message?: string } };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** A 401 means the session is gone; a full navigation also clears any stale client state. */
function goToSignIn(): FlashcardsClientError {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above
  if (typeof window !== "undefined") window.location.href = "/sign-in";
  return new FlashcardsClientError("UNAUTHORIZED", "Your session has expired. Sign in again.");
}

async function errorFromResponse(response: Response): Promise<FlashcardsClientError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new FlashcardsClientError(body.error?.code ?? "VALIDATION_ERROR", body.error?.message ?? GENERIC_ERROR_MESSAGE);
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

export function createApiFlashcardsClient(spaceId: string): FlashcardsClient {
  return {
    async listDecks() {
      const data = await requestJson<{ sets: DeckListItemResponse[] }>(`/api/spaces/${spaceId}/sets?kind=deck`);
      return data.sets;
    },

    async getSet(setId) {
      return requestJson<SetDetailResponse>(`/api/sets/${setId}`);
    },

    async createDeck(request: CreateDeckRequest) {
      const data = await requestJson<{ set: SetResponse }>(`/api/spaces/${spaceId}/sets`, jsonInit("POST", request));
      return data.set;
    },

    async deleteDeck(setId) {
      await requestJson<void>(`/api/sets/${setId}`, { method: "DELETE" });
    },

    async startOrResumePractice(setId) {
      const data = await requestJson<{ session: DeckSessionResponse }>(`/api/sets/${setId}/practice`, { method: "POST" });
      return data.session;
    },

    async rateCard(cardId, request) {
      const data = await requestJson<RatingResponse>(`/api/items/${cardId}/rating`, jsonInit("POST", request));
      return data.session;
    },
  };
}
