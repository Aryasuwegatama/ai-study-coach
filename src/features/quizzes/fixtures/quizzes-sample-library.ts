import { SET_FAILURE_REASONS, spreadQuestions } from "../quizzes-schemas";
import type { SetupTopic } from "./quizzes-sample-types";
import type { QuizItemAnswerKey, SetWithLatestAttempt } from "./quizzes-sample-types";
import { quizzesSampleSetupMaterials } from "./quizzes-sample-setup";

/**
 * EXAMPLE DATA (sample-data rule, `docs/CONTRIBUTING.md` "File naming").
 * Toggle to demonstrate the empty Quiz Library (acceptance criteria,
 * "Empty library... via a fixture toggle"), the same pattern T-09a used
 * for `MATERIALS_SAMPLE_EMPTY`.
 */
export const QUIZZES_SAMPLE_EMPTY = false;

const bioTopics = quizzesSampleSetupMaterials[0].topics;
const econTopics = quizzesSampleSetupMaterials[1].topics;

/** Stable ids this task's other fixtures (`attempts-sample-*.ts`) build on. */
export const QUIZ_SAMPLE_SET_IDS = {
  notStarted: "set-bio-not-started",
  inProgress: "set-econ-in-progress",
  submittedHigh: "set-bio-submitted-high",
  submittedLow: "set-econ-submitted-low",
  generating: "set-geo-generating",
  failed: "set-chem-failed",
  partial: "set-hist-partial",
} as const;

/**
 * Builds a quiz's internal answer key (sample-data rule): `count`
 * questions spread evenly across `topics` (`spreadQuestions`, the same
 * helper the real generator uses), with 4 options each and one correct
 * index that rotates by position so no two consecutive questions share
 * the same correct letter. `zeroSourceAt` forces one item's `sources` to
 * `[]`, for the "Source removed" state.
 */
export function buildQuizItems(params: {
  setId: string;
  topics: SetupTopic[];
  materialName: string;
  count: number;
  zeroSourceAt?: number;
}): QuizItemAnswerKey[] {
  const perTopic = spreadQuestions(params.count, params.topics.length);
  const items: QuizItemAnswerKey[] = [];
  let position = 1;
  params.topics.forEach((topic, topicIndex) => {
    for (let i = 0; i < perTopic[topicIndex]; i++) {
      const correctIndex = (position - 1) % 4;
      const options = [0, 1, 2, 3].map((optionIndex) =>
        optionIndex === correctIndex
          ? `${topic.name} — the correct answer`
          : `${topic.name} — a plausible but incorrect answer ${optionIndex + 1}`,
      );
      items.push({
        id: `${params.setId}-item-${position}`,
        position,
        topicId: topic.id,
        topicName: topic.name,
        prompt: `Example question ${position}: which statement about ${topic.name.toLowerCase()} is correct?`,
        options,
        correctIndex,
        difficulty: "medium",
        explanation: `${topic.name} explanation (example data): the correct option matches what "${params.materialName}" says about ${topic.name.toLowerCase()}.`,
        sources:
          position === params.zeroSourceAt
            ? []
            : [
                {
                  chunkId: `${params.setId}-chunk-${position}`,
                  materialName: params.materialName,
                  pages: `p. ${position}`,
                  excerpt: `"...example excerpt about ${topic.name.toLowerCase()}, standing in for the real source text..."`,
                },
              ],
      });
      position++;
    }
  });
  return items;
}

/** Keyed by set id, for `example-quizzes-client.ts` and the `attempts`
 * fixtures that build specific attempts/results from these items. */
export const quizzesSampleItemBanks: Record<string, QuizItemAnswerKey[]> = {
  [QUIZ_SAMPLE_SET_IDS.notStarted]: buildQuizItems({
    setId: QUIZ_SAMPLE_SET_IDS.notStarted,
    topics: bioTopics,
    materialName: quizzesSampleSetupMaterials[0].name,
    count: 10,
  }),
  [QUIZ_SAMPLE_SET_IDS.inProgress]: buildQuizItems({
    setId: QUIZ_SAMPLE_SET_IDS.inProgress,
    topics: econTopics,
    materialName: quizzesSampleSetupMaterials[1].name,
    count: 10,
  }),
  [QUIZ_SAMPLE_SET_IDS.submittedHigh]: buildQuizItems({
    setId: QUIZ_SAMPLE_SET_IDS.submittedHigh,
    topics: bioTopics,
    materialName: quizzesSampleSetupMaterials[0].name,
    count: 10,
    zeroSourceAt: 10,
  }),
  [QUIZ_SAMPLE_SET_IDS.submittedLow]: buildQuizItems({
    setId: QUIZ_SAMPLE_SET_IDS.submittedLow,
    topics: econTopics,
    materialName: quizzesSampleSetupMaterials[1].name,
    count: 10,
  }),
  [QUIZ_SAMPLE_SET_IDS.partial]: buildQuizItems({
    setId: QUIZ_SAMPLE_SET_IDS.partial,
    topics: bioTopics.slice(0, 2),
    materialName: quizzesSampleSetupMaterials[0].name,
    count: 8,
  }),
};

const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

/**
 * About six quizzes (issue #46) covering every status: ready and not
 * started, in progress, submitted (two different scores), generating,
 * failed (a real `SET_FAILURE_REASONS` reason) and partially generated
 * ("8 of 10 generated"). `latestAttempt` and `hasResults` fill gap 1
 * (`quizzes-sample-types.ts`).
 */
export const quizzesSampleLibrary: SetWithLatestAttempt[] = [
  {
    id: QUIZ_SAMPLE_SET_IDS.notStarted,
    kind: "quiz",
    title: "Cell Biology Basics",
    status: "ready",
    requestedCount: 10,
    generatedCount: 10,
    materialIds: [quizzesSampleSetupMaterials[0].id],
    topicIds: bioTopics.map((topic) => topic.id),
    error: null,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    latestAttempt: { status: "none" },
    hasResults: false,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.inProgress,
    kind: "quiz",
    title: "Markets and Equilibrium",
    status: "ready",
    requestedCount: 10,
    generatedCount: 10,
    materialIds: [quizzesSampleSetupMaterials[1].id],
    topicIds: econTopics.map((topic) => topic.id),
    error: null,
    createdAt: hoursAgo(26),
    updatedAt: hoursAgo(1),
    latestAttempt: { status: "in_progress", attemptId: "attempt-in-progress", answeredCount: 4, totalCount: 10 },
    hasResults: false,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.submittedHigh,
    kind: "quiz",
    title: "Photosynthesis Deep Dive",
    status: "ready",
    requestedCount: 10,
    generatedCount: 10,
    materialIds: [quizzesSampleSetupMaterials[0].id],
    topicIds: bioTopics.map((topic) => topic.id),
    error: null,
    createdAt: hoursAgo(72),
    updatedAt: hoursAgo(70),
    latestAttempt: { status: "submitted", attemptId: "attempt-submitted-high", score: 8, total: 10, percent: 80 },
    hasResults: true,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.submittedLow,
    kind: "quiz",
    title: "Elasticity Check-in",
    status: "ready",
    requestedCount: 10,
    generatedCount: 10,
    materialIds: [quizzesSampleSetupMaterials[1].id],
    topicIds: econTopics.map((topic) => topic.id),
    error: null,
    createdAt: hoursAgo(120),
    updatedAt: hoursAgo(118),
    latestAttempt: { status: "submitted", attemptId: "attempt-submitted-low", score: 5, total: 10, percent: 50 },
    hasResults: true,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.generating,
    kind: "quiz",
    title: "Plate Tectonics Review",
    status: "generating",
    requestedCount: 15,
    generatedCount: 0,
    materialIds: [quizzesSampleSetupMaterials[0].id],
    topicIds: [bioTopics[0].id],
    error: null,
    createdAt: hoursAgo(0.02),
    updatedAt: hoursAgo(0.02),
    latestAttempt: { status: "none" },
    hasResults: false,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.failed,
    kind: "quiz",
    title: "Reaction Rates",
    status: "failed",
    requestedCount: 20,
    generatedCount: 0,
    materialIds: [quizzesSampleSetupMaterials[1].id],
    topicIds: [econTopics[0].id],
    error: { code: "TOO_FEW_QUESTIONS", message: SET_FAILURE_REASONS.TOO_FEW_QUESTIONS },
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
    latestAttempt: { status: "none" },
    hasResults: false,
  },
  {
    id: QUIZ_SAMPLE_SET_IDS.partial,
    kind: "quiz",
    title: "Cell Structure Quickfire",
    status: "ready",
    requestedCount: 10,
    generatedCount: 8,
    materialIds: [quizzesSampleSetupMaterials[0].id],
    topicIds: bioTopics.slice(0, 2).map((topic) => topic.id),
    error: null,
    createdAt: hoursAgo(10),
    updatedAt: hoursAgo(9.8),
    latestAttempt: { status: "none" },
    hasResults: false,
  },
];
