import { z } from "zod";
import { withVerifyFullSslMode } from "@/server/db/db-connection-url";

/**
 * Server-only environment configuration.
 *
 * This validates the variables T-01a, T-01b and T-01c wire up: the
 * database, Private Blob, QStash, the AI provider and Better Auth (Google
 * sign-in only, per the T-01c decision). Variables for later tasks (the
 * cron route) are listed in PRD Section 4's "Environment variables" table
 * but are not required here; add them to this schema when their task
 * lands.
 *
 * Validation is lazy (`serverEnv()`, not a module-level `parse()`) so an
 * unrelated Next.js build step that merely imports this file does not fail
 * just because a variable is missing in that environment.
 */
const serverEnvSchema = z.object({
  // Database (Neon Postgres). Pooled URL for the app; the unpooled URL is
  // used by Drizzle Kit for migrations, which should not run through a
  // connection pooler. Each one's `sslmode` is made explicit as
  // `verify-full` (same behaviour as today; see db-connection-url.ts).
  DATABASE_URL: z.string().url().transform(withVerifyFullSslMode),
  DATABASE_URL_UNPOOLED: z.string().url().transform(withVerifyFullSslMode),
  // Present in every environment except Vercel Production, where tests
  // never run; optional here so `serverEnv()` keeps working elsewhere.
  DATABASE_URL_TEST: z.string().url().transform(withVerifyFullSslMode).optional(),

  // Private Blob storage.
  BLOB_READ_WRITE_TOKEN: z.string().min(1),

  // QStash background jobs.
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  QSTASH_URL: z.string().url().optional(),

  // AI provider.
  AI_PROVIDER: z.enum(["gemini", "fake"]).default("gemini"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL_GENERATE: z.string().min(1),
  AI_MODEL_CHECK: z.string().min(1),
  AI_MODEL_EMBED: z.string().min(1),

  // Better Auth (T-01b). BETTER_AUTH_URL is required on Production, but not
  // on previews, where the code derives the base URL from Vercel's own
  // branch-deployment-URL variable instead (see src/server/auth/auth-config.ts).
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),

  // Google sign-in (T-01c). Required everywhere — Google is the only sign-in
  // method. Arya provides these: the dev OAuth client's values go in each
  // developer's own .env.local, the production client's values go in Vercel
  // (see README "who provides which credential").
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  // Encrypts the payload the oauth-proxy plugin passes from Production to a
  // preview deployment during Google sign-in (see src/server/auth/auth-config.ts).
  // Required on Vercel (Production and Preview must share one value);
  // optional locally, where there is only one environment and the plugin
  // falls back to deriving a key from BETTER_AUTH_SECRET.
  OAUTH_PROXY_SECRET: z.string().min(32).optional(),

  // Vercel's own system variables (always present on Vercel, unset
  // locally): used to derive the preview base URL, matching the existing
  // APP_URL/VERCEL_BRANCH_URL precedent in PRD Section 4, and to tell
  // Production apart from Preview.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_BRANCH_URL: z.string().min(1).optional(),
  VERCEL_URL: z.string().min(1).optional(),
  // The project's production domain, set on every Vercel deployment
  // including previews (confirmed against Vercel's system-environment-
  // variables docs, 2026-11-07). Lets a preview deployment's oauth-proxy
  // plugin find Production's registered Google callback without a
  // hard-coded domain.
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Parses and caches the server environment on first use. Throws a clear,
 * safe error (names only, never values) if a required variable is missing
 * or malformed.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. Check .env.local against the Environment variables table in docs/prd/04-architecture-database.md.`,
    );
  }

  if (result.data.AI_PROVIDER === "gemini" && !result.data.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER=gemini.",
    );
  }

  if (result.data.VERCEL_ENV === "production" && !result.data.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is required on Vercel Production.");
  }

  if (
    (result.data.VERCEL_ENV === "production" || result.data.VERCEL_ENV === "preview") &&
    !result.data.OAUTH_PROXY_SECRET
  ) {
    throw new Error("OAUTH_PROXY_SECRET is required on Vercel Production and Preview.");
  }

  cached = result.data;
  return cached;
}
