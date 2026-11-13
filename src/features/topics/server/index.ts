// Other features import Topics only through this barrel (PRD Section 4 module rule).
export {
  listTopics,
  createTopic,
  updateTopic,
  getTopicDraft,
  saveTopicDraft,
  confirmTopicDraft,
  requireTopic,
  toTopicResponse,
} from "./topics-service";
export type { TopicResponse } from "../topics-schemas";
