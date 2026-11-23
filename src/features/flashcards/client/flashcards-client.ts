import type { CreateDeckRequest, SetDetailResponse, SetResponse } from "@/features/quizzes/quizzes-schemas";
import type { DeckListItemResponse, DeckSessionResponse, RateCardRequest, RatingResponse } from "../flashcards-schemas";

/** Thrown by `FlashcardsClient` methods for a server-shaped failure (a stable
 * error code and its message), so callers can show the contract message
 * without inspecting strings. */
export class FlashcardsClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The data interface every Flashcards screen talks to (T-18): the Deck
 * Library, the setup form and practice. `api-flashcards-client.ts` is the
 * implementation against the live routes. The setup screen reads materials and
 * topics through the Materials and Topics clients directly, like the quiz
 * setup; it uses `getSet` for a failed deck's "Try again" prefill.
 *
 * `startOrResumePractice` covers first practice, Resume and "Practise again":
 * the server resumes the in-progress session or starts a new one.
 */
export type FlashcardsClient = {
  listDecks(): Promise<DeckListItemResponse[]>;
  getSet(setId: string): Promise<SetDetailResponse>;
  createDeck(request: CreateDeckRequest): Promise<SetResponse>;
  deleteDeck(setId: string): Promise<void>;
  startOrResumePractice(setId: string): Promise<DeckSessionResponse>;
  rateCard(cardId: string, request: RateCardRequest): Promise<RatingResponse["session"]>;
};
