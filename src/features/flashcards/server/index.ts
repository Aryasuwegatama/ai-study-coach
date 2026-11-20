// Other features import Flashcards only through this barrel (PRD Section 4 module rule).
export { listDecks, startPractice, rateCard, flashcardError } from "./flashcards-service";
export { generateDeckJob } from "./generate-deck";
export type { DeckListItemResponse, DeckSessionResponse } from "../flashcards-schemas";
