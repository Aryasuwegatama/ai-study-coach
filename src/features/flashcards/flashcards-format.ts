import type { CardStyle } from "@/features/quizzes/quizzes-schemas";

export const CARD_STYLE_LABELS: Record<CardStyle, string> = {
  recall: "Recall",
  short_answer: "Short answer",
  mix: "Mix",
};

/** "1 card", "5 cards". */
export function cardCountLabel(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}
