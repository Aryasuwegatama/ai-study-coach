import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { isValidTimeZone } from "./time-zone";

const timeZoneSchema = z.string().refine(isValidTimeZone, {
  message: "Must be a valid IANA time zone name, e.g. Australia/Brisbane.",
});

/**
 * Resolves the base URL Better Auth tells clients it runs at.
 *
 * - Production: `BETTER_AUTH_URL`, required (checked in `serverEnv()`).
 * - Preview: Vercel gives every preview deployment its own address, so a
 *   fixed `BETTER_AUTH_URL` would be wrong. Derive it instead from
 *   `VERCEL_BRANCH_URL` (stable across redeploys of the same branch,
 *   already used for `APP_URL` per PRD Section 4) or `VERCEL_URL`.
 * - Local: `BETTER_AUTH_URL=http://localhost:3000`.
 */
function resolveBaseURL(): string {
  const env = serverEnv();
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  const host = env.VERCEL_BRANCH_URL ?? env.VERCEL_URL;
  if (host) return `https://${host}`;
  throw new Error(
    "No base URL available: set BETTER_AUTH_URL, or run on Vercel where VERCEL_URL is provided.",
  );
}

/**
 * Origins Better Auth accepts requests/redirects from, beyond the base URL
 * itself: the stable preview-branch URL and the exact per-deployment URL,
 * since a preview's BETTER_AUTH_URL-equivalent can be either depending on
 * how the student reached it.
 */
function resolveTrustedOrigins(): string[] {
  const env = serverEnv();
  const origins = new Set<string>();
  if (env.BETTER_AUTH_URL) origins.add(env.BETTER_AUTH_URL);
  if (env.VERCEL_BRANCH_URL) origins.add(`https://${env.VERCEL_BRANCH_URL}`);
  if (env.VERCEL_URL) origins.add(`https://${env.VERCEL_URL}`);
  return [...origins];
}

declare global {
  var __auth: ReturnType<typeof buildAuth> | undefined;
}

/**
 * Builds the Better Auth instance. Not called at module-evaluation time
 * (see `getAuth()` below): constructing it reads `serverEnv()`, and this
 * module is imported by the `/api/auth/[...all]` route handler, which
 * `next build` loads to collect route metadata. Deferring construction to
 * first real use keeps that collection pass from requiring every env var
 * this schema lists, for routes that have nothing to do with auth.
 */
function buildAuth() {
  return betterAuth({
    baseURL: resolveBaseURL(),
    secret: serverEnv().BETTER_AUTH_SECRET,
    trustedOrigins: resolveTrustedOrigins(),

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      // Related writes (e.g. creating a user and its session together on
      // sign-up) commit atomically; our `pg` driver supports transactions.
      transaction: true,
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
      // Student lands signed in right after creating an account (PRD
      // Section 2: "After the first sign-in with no spaces, the student
      // is taken to Create Study Space" assumes an active session).
      autoSignIn: true,
      password: {
        hash: (password) => argon2Hash(password),
        verify: ({ hash, password }) => argon2Verify(hash, password),
      },
    },

    user: {
      additionalFields: {
        // Security rule 1: identity/role never comes from the request
        // body. `input: false` makes Better Auth drop a client-sent value
        // for this field rather than trusting it — verified behaviour: a
        // `role` in the body is silently dropped (the request still
        // succeeds, stored as "student"); `notificationsSeenAt` below
        // instead rejects the whole request with 400 FIELD_NOT_ALLOWED.
        // Both keep a client from ever setting either field; neither is a
        // bug. A sign-up form that never sends these fields never notices
        // the difference.
        role: {
          type: "string",
          required: true,
          defaultValue: "student",
          input: false,
        },
        // Saved from the browser at sign-in (PRD Section 4). Accepted on
        // sign-up/update, but only a real IANA name is ever stored: the
        // Standard Schema validator rejects anything else before it
        // reaches the database. T-04c decides when the client sends it.
        timeZone: {
          type: "string",
          required: false,
          input: true,
          validator: { input: timeZoneSchema },
        },
        notificationsSeenAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },

    // Vercel functions don't share memory across invocations, so the
    // default in-memory counter wouldn't actually limit anything in
    // Preview or Production. Database storage makes the limit real
    // everywhere, at the cost of one extra table (`rate_limit`).
    rateLimit: {
      enabled: true,
      storage: "database",
    },

    advanced: {
      database: {
        // Matches the PRD's UUID domain IDs; Postgres generates it with
        // gen_random_uuid().
        generateId: "uuid",
      },
    },

    plugins: [nextCookies()],
  });
}

export function getAuth() {
  global.__auth ??= buildAuth();
  return global.__auth;
}
