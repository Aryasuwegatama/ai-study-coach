// Other features import Quizzes only through this barrel (PRD Section 4 module rule).
export { createSet, listSets, getSet, deleteSet, requireSet, toSetResponse, quizError } from "./quizzes-service";
export { generateQuizJob } from "./generate-quiz";
// The steps the deck job (features/flashcards) shares with the quiz job (T-18).
export {
  commitGroup,
  failGeneration,
  labelSources,
  loadExisting,
  loadPublishedPrompts,
  publishSet,
  runGeneration,
} from "./generation-shared";
export type { Plan, StudySet } from "./generation-shared";
export type { SetListItemResponse, SetResponse } from "../quizzes-schemas";
