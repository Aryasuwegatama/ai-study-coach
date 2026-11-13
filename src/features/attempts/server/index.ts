// Other features import Attempts only through this barrel (PRD Section 4 module rule).
export { startAttempt, getAttempt, saveAnswer, submitAttempt, requireAttempt } from "./attempts-service";
export type { AttemptResponse } from "../attempts-schemas";
