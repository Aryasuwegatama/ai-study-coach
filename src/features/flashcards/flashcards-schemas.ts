import { z } from "zod";
import type { QuestionSource } from "@/features/attempts/attempts-schemas";
import type { CardStyle, SetResponse } from "@/features/quizzes/quizzes-schemas";

/**
 * Flashcard decks: listing, practice sessions and ratings (T-18; PRD
 * Section 2 "Flashcards", Section 4 tables 6, 7 and 11 and the API table).
 * Creating a deck is `POST /api/spaces/:spaceId/sets` with `kind: "deck"`
 * (`features/quizzes/quizzes-schemas.ts`, `createDeckSchema`); this file has
 * the rest.
 *
 * Routes (Zod on every body, `requireUser()` on every route, ownership
 * checked on the server; a client-sent student id, rating count or score is
 * never read):
 * - `GET /api/spaces/:spaceId/sets?kind=deck` → `{ sets: DeckListItemResponse[] }`,
 *   newest first, computed in a fixed number of queries for the whole list.
 * - `POST /api/sets/:id/practice` → 201 `{ session }` (new) or 200 (resumes the
 *   student's in-progress session). One in-progress session per student per
 *   deck. Cards are the deck's active cards that still have a source
 *   (a card whose material was deleted leaves practice), in published order.
 *   - missing, malformed, someone else's, or a quiz: 404 `SET_NOT_FOUND`;
 *   - not ready: 409 `SET_NOT_READY`;
 *   - no practisable cards: 409 `DECK_NO_CARDS`.
 * - `POST /api/items/:id/rating` `{ sessionId, rating }` → `{ session }`.
 *   Saves the rating when the student presses Next, moves `currentPosition`
 *   just after that card (never backwards), and completes the session when
 *   the last unrated card is rated. There is no request key (a deviation
 *   from the PRD API table, recorded in Section 4): saving sets a value
 *   rather than adding one, so a double click or a retry changes nothing.
 *   The same rating sent again to a completed session returns the same
 *   result; a different one → 409 `DECK_SESSION_COMPLETED`.
 *   - someone else's or missing session: 404 `DECK_SESSION_NOT_FOUND`;
 *   - a card that isn't in that session's deck: 404 `ITEM_NOT_FOUND`.
 *
 * Ratings never touch `attempt_items`, `revision_items` or mastery, and
 * schedule nothing.
 */

export const FLASHCARD_API_ERRORS = {
  SET_NOT_READY: { status: 409, message: "This deck isn't ready yet." },
  DECK_NO_CARDS: { status: 409, message: "This deck's material was deleted." },
  DECK_SESSION_NOT_FOUND: { status: 404, message: "Practice session not found." },
  ITEM_NOT_FOUND: { status: 404, message: "Card not found." },
  DECK_SESSION_COMPLETED: { status: 409, message: "This practice session is already finished." },
} as const;
export type FlashcardApiErrorCode = keyof typeof FLASHCARD_API_ERRORS;

export const RATINGS = ["again", "got_it"] as const;
export type Rating = (typeof RATINGS)[number];

export const rateCardSchema = z.object({
  sessionId: z.uuid("Choose a valid practice session."),
  rating: z.enum(RATINGS, { error: "Rate the card Again or Got it." }),
});
export type RateCardRequest = z.infer<typeof rateCardSchema>;

/** The student's newest session on a deck. */
export type LatestSessionSummary =
  | { status: "none" }
  | { status: "in_progress"; sessionId: string; ratedCount: number; totalCount: number }
  | { status: "completed"; sessionId: string; gotIt: number; again: number; total: number };

/** One deck in the Deck Library. `practisableCount` 0 means "This deck's material was deleted". */
export type DeckListItemResponse = SetResponse & {
  latestSession: LatestSessionSummary;
  practisableCount: number;
  /** The deck's topics with their current names, in the order chosen (shown as tags). */
  topics: { id: string; name: string }[];
};

export type PracticeCard = {
  id: string;
  kind: "recall" | "short_answer";
  topicId: string;
  topicName: string;
  front: string;
  back: string;
  /** Short answer only: 2–4 points the answer should contain. */
  keyPoints: string[] | null;
  /** Never empty: a card with no source left isn't practised. */
  sources: QuestionSource[];
};

export type DeckSessionResponse = {
  id: string;
  setId: string;
  title: string;
  cardStyle: CardStyle | null;
  status: "in_progress" | "completed";
  /** `position` of the card after the last rated one. The screen opens on the first unrated card. */
  currentPosition: number;
  /** Card id → rating, for the cards rated so far. */
  ratings: Record<string, Rating>;
  cards: PracticeCard[];
};

export type RatingResponse = {
  session: {
    status: "in_progress" | "completed";
    currentPosition: number;
    ratedCount: number;
    totalCount: number;
    gotIt: number;
    again: number;
  };
};
