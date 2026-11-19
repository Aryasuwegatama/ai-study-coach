import type { AttemptResult, QuestionResult } from "../attempts-schemas";
import type { QuizItemAnswerKey } from "@/features/quizzes/fixtures/quizzes-sample-types";
import { QUIZ_SAMPLE_SET_IDS, quizzesSampleItemBanks } from "@/features/quizzes/fixtures/quizzes-sample-library";

/**
 * EXAMPLE DATA (sample-data rule). Scores a quiz's internal answer key
 * against selected answers — the same logic `example-quizzes-client.ts`
 * uses for `submitAttempt()` on any freshly taken or retaken attempt, not
 * only this file's two canned results.
 */
export function buildAttemptResult(items: QuizItemAnswerKey[], selected: Record<string, number | null>): AttemptResult {
  const questions: QuestionResult[] = items.map((item) => {
    const selectedIndex = selected[item.id] ?? null;
    return {
      itemId: item.id,
      position: item.position,
      topicId: item.topicId,
      topicName: item.topicName,
      prompt: item.prompt,
      options: item.options,
      selectedIndex,
      correctIndex: item.correctIndex,
      isCorrect: selectedIndex === item.correctIndex,
      explanation: item.explanation,
      sources: item.sources,
      aiGenerated: true,
    };
  });

  const topicOrder: string[] = [];
  const topicTotals = new Map<string, { topicName: string; correct: number; total: number }>();
  for (const question of questions) {
    if (!topicTotals.has(question.topicId)) {
      topicTotals.set(question.topicId, { topicName: question.topicName, correct: 0, total: 0 });
      topicOrder.push(question.topicId);
    }
    const entry = topicTotals.get(question.topicId);
    if (!entry) continue;
    entry.total += 1;
    if (question.isCorrect) entry.correct += 1;
  }

  const score = questions.filter((question) => question.isCorrect).length;
  const total = questions.length;
  return {
    score,
    total,
    percent: total === 0 ? 0 : Math.round((score / total) * 100),
    topics: topicOrder.map((topicId) => {
      const entry = topicTotals.get(topicId);
      return { topicId, topicName: entry?.topicName ?? "", correct: entry?.correct ?? 0, total: entry?.total ?? 0 };
    }),
    questions,
  };
}

/** The first `correctCount` questions answered correctly, the rest wrong —
 * enough to produce a realistic, specific score for example data. */
function selectedForScore(items: QuizItemAnswerKey[], correctCount: number): Record<string, number | null> {
  const selected: Record<string, number | null> = {};
  items.forEach((item, index) => {
    selected[item.id] = index < correctCount ? item.correctIndex : (item.correctIndex + 1) % 4;
  });
  return selected;
}

/**
 * Two submitted results (issue #46), each with per-topic scores,
 * explanations and sources. "Photosynthesis Deep Dive" includes the one
 * item (position 10) whose `sources: []` shows "Source removed".
 */
export const ATTEMPT_SAMPLE_SUBMITTED_HIGH_ID = "attempt-submitted-high";
export const ATTEMPT_SAMPLE_SUBMITTED_LOW_ID = "attempt-submitted-low";

const highItems = quizzesSampleItemBanks[QUIZ_SAMPLE_SET_IDS.submittedHigh];
const lowItems = quizzesSampleItemBanks[QUIZ_SAMPLE_SET_IDS.submittedLow];

export const attemptsSampleResultSeeds = [
  {
    attemptId: ATTEMPT_SAMPLE_SUBMITTED_HIGH_ID,
    setId: QUIZ_SAMPLE_SET_IDS.submittedHigh,
    items: highItems,
    selected: selectedForScore(highItems, 8),
    startedAt: new Date(Date.now() - 70 * 60 * 60 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 70 * 60 * 60 * 1000 + 8 * 60 * 1000).toISOString(),
  },
  {
    attemptId: ATTEMPT_SAMPLE_SUBMITTED_LOW_ID,
    setId: QUIZ_SAMPLE_SET_IDS.submittedLow,
    items: lowItems,
    selected: selectedForScore(lowItems, 5),
    startedAt: new Date(Date.now() - 118 * 60 * 60 * 1000).toISOString(),
    submittedAt: new Date(Date.now() - 118 * 60 * 60 * 1000 + 12 * 60 * 1000).toISOString(),
  },
];
