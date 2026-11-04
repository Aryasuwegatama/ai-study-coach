import { z } from "zod";

/**
 * Server-only environment configuration.
 *
 * This validates only the variables this task (T-01a) wires up: the
 * database, Private Blob, QStash and the AI provider. Variables for later
 * tasks (Better Auth, the cron route) are documented in `.env.example` but
 * are not required here; add them to this schema when their task lands.
 *
 * Validation is lazy (`serverEnv()`, not a module-level `parse()`) so an
 * unrelated Next.js build step that merely imports this file does not fail
 * just because a variable is missing in that environment.
 */
const serverEnvSchema = z.object({
  // Database (Neon Postgres). Pooled URL for the app; the unpooled URL is
  // used by Drizzle Kit for migrations, which should not run through a
  // connection pooler.
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  // Present in every environment except Vercel Production, where tests
  // never run; optional here so `serverEnv()` keeps working elsewhere.
  DATABASE_URL_TEST: z.string().url().optional(),

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
      `Invalid or missing environment variables: ${missing}. Check .env.local against .env.example.`,
    );
  }

  if (result.data.AI_PROVIDER === "gemini" && !result.data.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER=gemini.",
    );
  }

  cached = result.data;
  return cached;
}
