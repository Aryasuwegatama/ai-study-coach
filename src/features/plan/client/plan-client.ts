import type { CheckRequest, CheckResult, MistakesResponse } from "@/features/revision/revision-schemas";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import type { CreatePlanItemRequest, PlanItemResponse, Suggestion, UpdatePlanItemRequest } from "../plan-schemas";

/** Thrown by `PlanClient` methods for a server-shaped failure (a stable error code and its message). */
export class PlanClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** What Review mistakes loads: one topic or one whole Study Space. */
export type MistakesScope = { topicId: string } | { spaceId: string };

/**
 * The data interface for My Plan and Review mistakes (T-15): the one shape
 * both screens talk to. `api-plan-client.ts` is the real implementation
 * against the live routes; there is no example-data version (the task was
 * built straight on the real API).
 */
export type PlanClient = {
  listMistakes(scope: MistakesScope): Promise<MistakesResponse>;
  checkMistake(revisionItemId: string, request: CheckRequest): Promise<CheckResult>;
  listItems(): Promise<PlanItemResponse[]>;
  createItem(request: CreatePlanItemRequest): Promise<PlanItemResponse>;
  updateItem(itemId: string, request: UpdatePlanItemRequest): Promise<PlanItemResponse>;
  deleteItem(itemId: string): Promise<void>;
  listSuggestions(): Promise<Suggestion[]>;
  /** The student's Study Spaces, for "Add your own" (an item can belong to one). */
  listSpaces(): Promise<SpaceResponse[]>;
};
