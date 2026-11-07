import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { serverEnv } from "@/lib/server-env";

/**
 * Thin AI provider adapter: exposes configured model instances only.
 *
 * `callAI()` (logging, retries, the fake test provider — PRD Section 3,
 * "Rules for every AI call") is built in the AI pipeline tasks (T-02 and
 * later), on top of this. Model IDs come from env, never hard-coded, so
 * switching models is a config change.
 */
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function googleProvider() {
  google ??= createGoogleGenerativeAI({
    apiKey: serverEnv().GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google;
}

/** The model used for topic suggestions, questions and cards. */
export function generateModel() {
  return googleProvider()(serverEnv().AI_MODEL_GENERATE);
}

/** The cheaper model used for the answer-support check. */
export function checkModel() {
  return googleProvider()(serverEnv().AI_MODEL_CHECK);
}

/** The embedding model for chunk and query vectors (768-D, manually L2-normalised by the caller). */
export function embedModel() {
  return googleProvider().embeddingModel(serverEnv().AI_MODEL_EMBED);
}
