import type { DashboardSampleSnapshot } from "./dashboard-sample-types";

/**
 * Example "Learning Snapshot" metrics (Figma node 80:6946, "Learning
 * Snapshot" / "Snapshot metric"). Invented content only. Deleted once a
 * real progress query backs this card (T-14/T-15).
 */
export const dashboardSampleSnapshot: DashboardSampleSnapshot = {
  activeSpaces: 4,
  activeSpacesHint: "Your private workspaces",
  finalQuizAttempts: 9,
  finalQuizAttemptsHint: "11–17 Oct",
  finalQuizAccuracyPercent: 66.7,
  finalQuizAccuracyHint: "60 / 90 correct · 11–17 Oct",
  cardsDueForReview: 3,
  cardsDueForReviewHint: "2 overdue · 1 due today",
};
