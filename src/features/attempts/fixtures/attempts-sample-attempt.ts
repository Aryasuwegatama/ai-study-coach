import type { AttemptQuestionWithTopicName, QuizItemAnswerKey } from "@/features/quizzes/fixtures/quizzes-sample-types";
import { QUIZ_SAMPLE_SET_IDS, quizzesSampleItemBanks } from "@/features/quizzes/fixtures/quizzes-sample-library";

/**
 * EXAMPLE DATA (sample-data rule, `docs/CONTRIBUTING.md` "File naming").
 * Strips a quiz's internal answer key down to what the attempt screen is
 * allowed to see before submission — no `correctIndex`, `explanation` or
 * `sources` (security rule: no answer keys before submission). Shared by
 * `example-quizzes-client.ts` for every in-progress attempt (fresh,
 * resumed or retaken), not only this file's canned seed.
 */
export function toAttemptQuestion(item: QuizItemAnswerKey, selectedIndex: number | null): AttemptQuestionWithTopicName {
  return {
    itemId: item.id,
    position: item.position,
    topicId: item.topicId,
    topicName: item.topicName,
    prompt: item.prompt,
    options: item.options,
    selectedIndex,
  };
}

export function buildAttemptQuestions(
  items: QuizItemAnswerKey[],
  selected: Record<string, number | null>,
): AttemptQuestionWithTopicName[] {
  return items.map((item) => toAttemptQuestion(item, selected[item.id] ?? null));
}

const inProgressItems = quizzesSampleItemBanks[QUIZ_SAMPLE_SET_IDS.inProgress];
const inProgressAnswers: Record<string, number | null> = {};
inProgressItems.slice(0, 4).forEach((item, index) => {
  // A mix of right and wrong so Resume shows a realistic "4 of 10 answered" state.
  inProgressAnswers[item.id] = index % 2 === 0 ? item.correctIndex : (item.correctIndex + 1) % 4;
});

/** A 10-question attempt (issue #46), answered 4 of 10 — the seed
 * `example-quizzes-client.ts` loads as "Markets and Equilibrium"'s saved,
 * resumable state. */
export const ATTEMPT_SAMPLE_IN_PROGRESS_ID = "attempt-in-progress";

export const attemptsSampleAttemptSeed = {
  attemptId: ATTEMPT_SAMPLE_IN_PROGRESS_ID,
  setId: QUIZ_SAMPLE_SET_IDS.inProgress,
  items: inProgressItems,
  selected: inProgressAnswers,
  startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};
