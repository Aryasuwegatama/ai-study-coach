import type { DashboardSampleContinueStudying } from "./dashboard-sample-types";

/**
 * Example "Continue Studying" card (Figma node 80:6946, "Resume
 * flashcards · HTML Fundamentals" + "Last session"). Invented content
 * only. Deleted once a real in-progress deck session backs this card
 * (T-14 `deck_sessions`).
 */
export const dashboardSampleContinueStudying: DashboardSampleContinueStudying = {
  spaceName: "HTML Fundamentals",
  deckStyleLabel: "Flashcards",
  deckTopicLabel: "Semantic HTML elements",
  practiceModeLabel: "Recall practice",
  cardsCompleted: 8,
  cardsTotal: 15,
  lastSessionTitle: "Semantic HTML",
};
