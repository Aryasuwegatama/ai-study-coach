// Other features import Quizzes only through this barrel (PRD Section 4 module rule).
export { createQuiz, listSets, getSet, deleteSet, requireSet, toSetResponse, quizError } from "./quizzes-service";
export { generateQuizJob } from "./generate-quiz";
export type { SetListItemResponse, SetResponse } from "../quizzes-schemas";
