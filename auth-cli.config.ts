import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Entry point for the `auth` CLI only (`pnpm run auth:generate`).
 *
 * The app itself never imports this file — it uses `getAuth()` from
 * `src/server/auth/config.ts`, which builds the Better Auth instance lazily
 * so that importing the config module (e.g. because `next build` loads the
 * `/api/auth/[...all]` route to collect metadata) doesn't force every env
 * var in `serverEnv()` to be present.
 *
 * The CLI instead needs a plain `auth` export it can statically import and
 * introspect, so this file builds the instance eagerly, for CLI use only.
 */
import { getAuth } from "./src/server/auth/config";

export const auth = getAuth();
