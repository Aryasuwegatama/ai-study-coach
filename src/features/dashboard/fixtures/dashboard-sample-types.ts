/**
 * Shared shapes for the Dashboard's example data (T-04b). Kept minimal and
 * close to the eventual PRD Section 4 tables (`study_spaces`, `study_sets`,
 * `revision_items`) so T-05 and later tasks can swap in real data without
 * changing the components that render these shapes.
 */

export type DashboardSampleSnapshot = {
  activeSpaces: number;
  activeSpacesHint: string;
  finalQuizAttempts: number;
  finalQuizAttemptsHint: string;
  finalQuizAccuracyPercent: number;
  finalQuizAccuracyHint: string;
  cardsDueForReview: number;
  cardsDueForReviewHint: string;
};

/** Mirrors the eventual `study_sets` (kind: "deck") + `deck_sessions` rows. */
export type DashboardSampleContinueStudying = {
  spaceName: string;
  deckStyleLabel: string;
  deckTopicLabel: string;
  practiceModeLabel: string;
  cardsCompleted: number;
  cardsTotal: number;
  lastSessionTitle: string;
};

export type DashboardRevisionStatus = "overdue" | "today";
export type DashboardRevisionKind = "quiz" | "flashcards";

/** Mirrors the eventual `revision_items` row. */
export type DashboardSampleRevisionItem = {
  id: string;
  title: string;
  spaceName: string;
  kind: DashboardRevisionKind;
  status: DashboardRevisionStatus;
  dueLabel: string;
};
