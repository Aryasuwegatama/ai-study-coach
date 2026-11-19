import { ATTEMPT_API_ERRORS, type AttemptResult, type SaveAnswerRequest } from "@/features/attempts/attempts-schemas";
import { attemptsSampleAttemptSeed, buildAttemptQuestions } from "@/features/attempts/fixtures/attempts-sample-attempt";
import { attemptsSampleResultSeeds, buildAttemptResult } from "@/features/attempts/fixtures/attempts-sample-result";
import {
  DAILY_GENERATION_LIMIT,
  QUIZ_API_ERRORS,
  type CreateQuizRequest,
  type QuizItemPublic,
  type SetDetailResponse,
} from "../quizzes-schemas";
import { buildQuizItems, QUIZZES_SAMPLE_EMPTY, quizzesSampleItemBanks, quizzesSampleLibrary } from "../fixtures/quizzes-sample-library";
import { quizzesSampleSetupMaterials } from "../fixtures/quizzes-sample-setup";
import type { QuizItemAnswerKey, SetupMaterial, SetupTopic, SetWithLatestAttempt } from "../fixtures/quizzes-sample-types";
import { QuizzesClientError, type ExampleAttemptResponse, type QuizzesClient } from "./quizzes-client";

/**
 * T-12a's only implementation of `QuizzesClient` (issue #46, plan step
 * 2), backed by the sample fixtures instead of the real quiz and attempt
 * APIs. T-12b deletes this file along with the rest of `fixtures/` once
 * it adds the real implementation against the live routes.
 *
 * State lives at module scope so it survives across this component
 * tree's remounts for the length of the browser tab, the same way T-09a's
 * `example-materials-client.ts` does; a full page reload resets it back
 * to the fixtures.
 */

let library: SetWithLatestAttempt[] = QUIZZES_SAMPLE_EMPTY ? [] : quizzesSampleLibrary.map((set) => ({ ...set }));
const itemBanks: Record<string, QuizItemAnswerKey[]> = { ...quizzesSampleItemBanks };

type AttemptState = {
  id: string;
  setId: string;
  status: "in_progress" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  /** This attempt's own shuffled items (question and option order) —
   * each new attempt shuffles independently of the quiz's published
   * item bank (contract: "Each new attempt shuffles question and
   * option order"). */
  items: QuizItemAnswerKey[];
  selected: Record<string, number | null>;
  result: AttemptResult | null;
};

const attempts = new Map<string, AttemptState>();

if (!QUIZZES_SAMPLE_EMPTY) {
  attempts.set(attemptsSampleAttemptSeed.attemptId, {
    id: attemptsSampleAttemptSeed.attemptId,
    setId: attemptsSampleAttemptSeed.setId,
    status: "in_progress",
    startedAt: attemptsSampleAttemptSeed.startedAt,
    submittedAt: null,
    items: attemptsSampleAttemptSeed.items,
    selected: attemptsSampleAttemptSeed.selected,
    result: null,
  });
  for (const seed of attemptsSampleResultSeeds) {
    attempts.set(seed.attemptId, {
      id: seed.attemptId,
      setId: seed.setId,
      status: "submitted",
      startedAt: seed.startedAt,
      submittedAt: seed.submittedAt,
      items: seed.items,
      selected: seed.selected,
      result: buildAttemptResult(seed.items, seed.selected),
    });
  }
}

/**
 * Seeded one below the real limit so the SECOND "Generate quiz" the
 * student tries in this session hits `DAILY_LIMIT_REACHED` (acceptance
 * criteria: "the daily-limit error can be seen"), without blocking the
 * first and breaking the "Generating card turns Ready" demo.
 */
let generationsToday = DAILY_GENERATION_LIMIT - 1;

/** A save attempt fails once, the first time it's ever called, to
 * demonstrate the "Couldn't save, retrying" autosave status without
 * relying on real flakiness; every save after that succeeds. */
let hasSimulatedAutosaveRetry = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findSetRow(setId: string): SetWithLatestAttempt | undefined {
  return library.find((set) => set.id === setId);
}

function findSetupMaterial(materialId: string): SetupMaterial | undefined {
  return quizzesSampleSetupMaterials.find((material) => material.id === materialId);
}

function findSetupTopic(topicId: string): { topic: SetupTopic; material: SetupMaterial } | undefined {
  for (const material of quizzesSampleSetupMaterials) {
    const topic = material.topics.find((candidate) => candidate.id === topicId);
    if (topic) return { topic, material };
  }
  return undefined;
}

function toQuizItemPublic(item: QuizItemAnswerKey): QuizItemPublic {
  return {
    id: item.id,
    position: item.position,
    topicId: item.topicId,
    prompt: item.prompt,
    options: item.options,
    difficulty: item.difficulty,
  };
}

function titleFromTopics(topics: SetupTopic[]): string {
  if (topics.length === 0) return "New quiz";
  if (topics.length === 1) return `${topics[0].name} quiz`;
  return `${topics[0].name} and ${topics.length - 1} more topic${topics.length > 2 ? "s" : ""}`;
}

function shuffleArray<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffles one item's options, remapping `correctIndex` to wherever the
 * correct option landed. */
function shuffleOptions(item: QuizItemAnswerKey): QuizItemAnswerKey {
  const order = shuffleArray(item.options.map((_, index) => index));
  return { ...item, options: order.map((index) => item.options[index]), correctIndex: order.indexOf(item.correctIndex) };
}

/** Shuffles question order too, then renumbers `position` 1..N to match. */
function shuffleForAttempt(items: QuizItemAnswerKey[]): QuizItemAnswerKey[] {
  return shuffleArray(items.map(shuffleOptions)).map((item, index) => ({ ...item, position: index + 1 }));
}

function toAttemptResponse(state: AttemptState): ExampleAttemptResponse {
  return {
    id: state.id,
    setId: state.setId,
    status: state.status,
    startedAt: state.startedAt,
    submittedAt: state.submittedAt,
    questions: state.status === "in_progress" ? buildAttemptQuestions(state.items, state.selected) : null,
    result: state.result,
  };
}

export function createExampleQuizzesClient(): QuizzesClient {
  return {
    async listSets() {
      return library;
    },

    async getSet(setId) {
      const row = findSetRow(setId);
      if (!row) throw new QuizzesClientError("SET_NOT_FOUND", QUIZ_API_ERRORS.SET_NOT_FOUND.message);
      const items = (itemBanks[setId] ?? []).map(toQuizItemPublic);
      const response: SetDetailResponse = { set: row, items };
      return response;
    },

    async createQuiz(request: CreateQuizRequest) {
      // Checked in the same order as the real contract (quizzes-schemas.ts).
      for (const materialId of request.materialIds) {
        const material = findSetupMaterial(materialId);
        if (!material || material.status !== "ready") {
          throw new QuizzesClientError("MATERIAL_NOT_READY", QUIZ_API_ERRORS.MATERIAL_NOT_READY.message);
        }
      }
      const availableTopicIds = new Set(
        request.materialIds.flatMap((materialId) => findSetupMaterial(materialId)?.topics.map((topic) => topic.id) ?? []),
      );
      for (const topicId of request.topicIds) {
        if (!availableTopicIds.has(topicId)) {
          throw new QuizzesClientError("TOPIC_NOT_IN_MATERIALS", QUIZ_API_ERRORS.TOPIC_NOT_IN_MATERIALS.message);
        }
      }
      if (request.topicIds.length > request.count) {
        throw new QuizzesClientError("TOO_MANY_TOPICS", QUIZ_API_ERRORS.TOO_MANY_TOPICS.message);
      }
      if (generationsToday >= DAILY_GENERATION_LIMIT) {
        throw new QuizzesClientError("DAILY_LIMIT_REACHED", QUIZ_API_ERRORS.DAILY_LIMIT_REACHED.message);
      }
      generationsToday += 1;

      const topicRefs = request.topicIds
        .map((topicId) => findSetupTopic(topicId))
        .filter((found): found is { topic: SetupTopic; material: SetupMaterial } => found !== undefined);
      const materialName = topicRefs[0]?.material.name ?? "the selected materials";

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const created: SetWithLatestAttempt = {
        id,
        kind: "quiz",
        title: "Generating quiz…",
        status: "generating",
        requestedCount: request.count,
        generatedCount: 0,
        materialIds: request.materialIds,
        topicIds: request.topicIds,
        error: null,
        createdAt: now,
        updatedAt: now,
        latestAttempt: { status: "none" },
        hasResults: false,
      };
      library = [created, ...library];

      // Simulates background generation (PRD Section 3): the Quiz Library
      // polls `listSets()` and sees this card flip from Generating to Ready.
      setTimeout(() => {
        const topics = topicRefs.map((ref) => ref.topic);
        const items = buildQuizItems({ setId: id, topics, materialName, count: request.count });
        itemBanks[id] = items;
        library = library.map((set) =>
          set.id === id
            ? { ...set, status: "ready", generatedCount: items.length, title: titleFromTopics(topics), updatedAt: new Date().toISOString() }
            : set,
        );
      }, 4000);

      return created;
    },

    async deleteSet(setId) {
      const row = findSetRow(setId);
      if (!row) throw new QuizzesClientError("SET_NOT_FOUND", QUIZ_API_ERRORS.SET_NOT_FOUND.message);
      // Checks every attempt on this quiz, not just the latest one: after a
      // retake the latest is "in progress" while an earlier submitted one
      // still exists (same rule as `quizzes-service.ts`).
      const setAttempts = [...attempts.values()].filter((attempt) => attempt.setId === setId);
      if (setAttempts.some((attempt) => attempt.status === "submitted")) {
        throw new QuizzesClientError("SET_HAS_RESULTS", QUIZ_API_ERRORS.SET_HAS_RESULTS.message);
      }
      for (const attempt of setAttempts) attempts.delete(attempt.id);
      library = library.filter((set) => set.id !== setId);
      delete itemBanks[setId];
    },

    async listSetupMaterials() {
      return quizzesSampleSetupMaterials;
    },

    async startOrResumeAttempt(setId) {
      const row = findSetRow(setId);
      if (!row) throw new QuizzesClientError("SET_NOT_FOUND", QUIZ_API_ERRORS.SET_NOT_FOUND.message);
      if (row.status !== "ready") {
        throw new QuizzesClientError("SET_NOT_READY", ATTEMPT_API_ERRORS.SET_NOT_READY.message);
      }

      if (row.latestAttempt.status === "in_progress") {
        const existing = attempts.get(row.latestAttempt.attemptId);
        if (existing) return toAttemptResponse(existing);
      }

      // No in-progress attempt: starts a new one, whether this is the
      // quiz's first attempt or a retake after a submitted one.
      const items = shuffleForAttempt(itemBanks[setId] ?? []);
      const attemptId = crypto.randomUUID();
      const state: AttemptState = {
        id: attemptId,
        setId,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        submittedAt: null,
        items,
        selected: {},
        result: null,
      };
      attempts.set(attemptId, state);
      library = library.map((set) =>
        set.id === setId
          ? { ...set, latestAttempt: { status: "in_progress", attemptId, answeredCount: 0, totalCount: items.length } }
          : set,
      );
      return toAttemptResponse(state);
    },

    async getAttempt(attemptId) {
      const state = attempts.get(attemptId);
      if (!state) throw new QuizzesClientError("ATTEMPT_NOT_FOUND", ATTEMPT_API_ERRORS.ATTEMPT_NOT_FOUND.message);
      return toAttemptResponse(state);
    },

    async saveAnswer(attemptId, request: SaveAnswerRequest) {
      const state = attempts.get(attemptId);
      if (!state) throw new QuizzesClientError("ATTEMPT_NOT_FOUND", ATTEMPT_API_ERRORS.ATTEMPT_NOT_FOUND.message);
      if (state.status === "submitted") {
        throw new QuizzesClientError("ATTEMPT_SUBMITTED", ATTEMPT_API_ERRORS.ATTEMPT_SUBMITTED.message);
      }
      const item = state.items.find((candidate) => candidate.id === request.itemId);
      if (!item) {
        throw new QuizzesClientError("ITEM_NOT_IN_ATTEMPT", ATTEMPT_API_ERRORS.ITEM_NOT_IN_ATTEMPT.message);
      }

      await sleep(500);
      if (!hasSimulatedAutosaveRetry) {
        hasSimulatedAutosaveRetry = true;
        throw new QuizzesClientError("AUTOSAVE_FAILED", "Couldn't save your answer. Retrying…");
      }

      state.selected = { ...state.selected, [request.itemId]: request.selectedIndex };
      const answeredCount = Object.values(state.selected).filter((value) => value !== null).length;
      library = library.map((set) =>
        set.id === state.setId && set.latestAttempt.status === "in_progress"
          ? { ...set, latestAttempt: { ...set.latestAttempt, answeredCount } }
          : set,
      );
      return toAttemptResponse(state);
    },

    async submitAttempt(attemptId) {
      const state = attempts.get(attemptId);
      if (!state) throw new QuizzesClientError("ATTEMPT_NOT_FOUND", ATTEMPT_API_ERRORS.ATTEMPT_NOT_FOUND.message);
      // Submitting twice returns the same result (contract).
      if (state.status === "submitted") return toAttemptResponse(state);

      const result = buildAttemptResult(state.items, state.selected);
      state.status = "submitted";
      state.submittedAt = new Date().toISOString();
      state.result = result;
      library = library.map((set) =>
        set.id === state.setId
          ? {
              ...set,
              latestAttempt: {
                status: "submitted",
                attemptId: state.id,
                score: result.score,
                total: result.total,
                percent: result.percent,
              },
              hasResults: true,
            }
          : set,
      );
      return toAttemptResponse(state);
    },
  };
}
