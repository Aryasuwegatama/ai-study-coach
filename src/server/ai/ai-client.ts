import { gateway } from "ai";
import { serverEnv } from "@/lib/server-env";

/**
 * Thin AI provider adapter: exposes configured model instances only.
 *
 * `callAI()` (logging, retries, the fake test provider — PRD Section 3,
 * "Rules for every AI call") is built in the AI pipeline tasks (T-02 and
 * later), on top of this. Model IDs come from env, never hard-coded, so
 * switching models is a config change.
 *
 * Models are reached through the Vercel AI Gateway (T-02b): the `gateway`
 * singleton exported from `ai` reads `AI_GATEWAY_API_KEY` from the
 * environment when set (local development), and falls back to Vercel OIDC
 * when it isn't (Vercel deployments), so no provider instance needs to be
 * built here.
 */

/** The model used for topic suggestions, questions and cards. */
export function generateModel() {
  return gateway(serverEnv().AI_MODEL_GENERATE);
}

/** The cheaper model used for the answer-support check. */
export function checkModel() {
  return gateway(serverEnv().AI_MODEL_CHECK);
}

/** The embedding model for chunk and query vectors (768-D, manually L2-normalised by the caller). */
export function embedModel() {
  return gateway.embeddingModel(serverEnv().AI_MODEL_EMBED);
}
