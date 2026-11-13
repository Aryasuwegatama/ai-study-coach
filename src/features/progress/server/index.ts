// Other features import Progress only through this barrel (PRD Section 4 module rule).
export { getAllProgress, getSpaceProgress, getTopicMastery, masteryFor, weakTopicIds } from "./progress-service";
export type { TopicMastery, SpaceProgress } from "../progress-schemas";
