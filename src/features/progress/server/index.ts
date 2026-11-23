// Other features import Progress only through this barrel (PRD Section 4 module rule).
export { getAllProgress, getSpaceProgress, getTopicMastery, masteryFor, weakTopicIds } from "./progress-service";
export { getActivity } from "./activity-service";
export type { TopicMastery, TopicProgress, SpaceProgress, TopicMasteryDetail, ActivityResponse } from "../progress-schemas";
