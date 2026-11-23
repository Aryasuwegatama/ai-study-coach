import type { AttemptResponse, SaveAnswerRequest } from "@/features/attempts/attempts-schemas";
import type { CreateReportRequest, ReportResponse } from "@/features/reports/reports-schemas";
import type { CreateQuizRequest, SetDetailResponse, SetListItemResponse, SetResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "./quizzes-client";

/**
 * T-12b's real `QuizzesClient`, against the live quiz, attempt and report
 * routes (plan step 2; mirrors `api-materials-client.ts`'s request
 * handling and 401 redirect). Runs entirely in the browser: no
 * `"use server"`, no secrets.
 */

type ErrorBody = { error?: { code?: string; message?: string } };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** A 401 means the session is gone; a full navigation also clears any stale client state. */
function goToSignIn(): QuizzesClientError {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above
  if (typeof window !== "undefined") window.location.href = "/sign-in";
  return new QuizzesClientError("UNAUTHORIZED", "Your session has expired. Sign in again.");
}

async function errorFromResponse(response: Response): Promise<QuizzesClientError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new QuizzesClientError(body.error?.code ?? "VALIDATION_ERROR", body.error?.message ?? GENERIC_ERROR_MESSAGE);
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

export function createApiQuizzesClient(spaceId: string): QuizzesClient {
  return {
    async listSets() {
      const data = await requestJson<{ sets: SetListItemResponse[] }>(`/api/spaces/${spaceId}/sets?kind=quiz`);
      return data.sets;
    },

    async getSet(setId) {
      return requestJson<SetDetailResponse>(`/api/sets/${setId}`);
    },

    async createQuiz(request: CreateQuizRequest) {
      const data = await requestJson<{ set: SetResponse }>(`/api/spaces/${spaceId}/sets`, jsonInit("POST", request));
      return data.set;
    },

    async deleteSet(setId) {
      await requestJson<void>(`/api/sets/${setId}`, { method: "DELETE" });
    },

    async startOrResumeAttempt(setId) {
      const data = await requestJson<{ attempt: AttemptResponse }>(`/api/sets/${setId}/attempts`, { method: "POST" });
      return data.attempt;
    },

    async getAttempt(attemptId) {
      const data = await requestJson<{ attempt: AttemptResponse }>(`/api/attempts/${attemptId}`);
      return data.attempt;
    },

    async saveAnswer(attemptId, request: SaveAnswerRequest) {
      const data = await requestJson<{ attempt: AttemptResponse }>(`/api/attempts/${attemptId}/answers`, jsonInit("PATCH", request));
      return data.attempt;
    },

    async submitAttempt(attemptId) {
      const data = await requestJson<{ attempt: AttemptResponse }>(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      return data.attempt;
    },

    async reportItem(itemId, request: CreateReportRequest) {
      const data = await requestJson<{ report: ReportResponse }>(`/api/items/${itemId}/report`, jsonInit("POST", request));
      return data.report;
    },
  };
}
