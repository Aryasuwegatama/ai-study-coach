// Other features import Revision only through this barrel (PRD Section 4 module rule).
export { listMistakes, checkMistake } from "./revision-service";
export type { MistakeQuestion, MistakesResponse, CheckResult } from "../revision-schemas";
