import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy, oneTap } from "better-auth/plugins";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { db } from "@/server/db/db-client";
import * as schema from "@/server/db/schema";
import { isValidTimeZone } from "./time-zone-validator";

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

/**
 * The app's single Production URL — not "this deployment's own URL" like
 * `resolveBaseURL()`. Used by the `oAuthProxy` plugin (T-01c) so a Preview
 * deployment, whose own domain is never registered with Google, exchanges
 * the Google authorization code through Production's registered callback
 * instead (`https://<production>/api/auth/callback/google`), then has
 * Production hand the resulting session back to the Preview's own
 * database. See the plugin's `before`/`after` hooks on `/sign-in/social`
 * and `/callback/:id` in `node_modules/better-auth/dist/plugins/oauth-proxy`
 * for the exact mechanism.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is Vercel's own answer to "what is this
 * project's Production domain", set on every deployment including Previews
 * (confirmed against Vercel's system-environment-variables docs). Falling
 * back to `BETTER_AUTH_URL` (only set on Production itself) and finally to
 * `resolveBaseURL()` means that locally, and in the unlikely case neither
 * Vercel variable is present, `productionURL` equals the running
 * deployment's own URL — the plugin's `checkSkipProxy` then treats the
 * current request as already being on Production and skips proxying,
 * which is the correct behaviour outside a real Preview.
 */
function resolveProductionURL(): string {
  const env = serverEnv();
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  return resolveBaseURL();
}

declare global {
  var __auth: ReturnType<typeof buildAuth> | undefined;
}

/**
 * The Better Auth options shared by the real app instance (`buildAuth()`
 * below) and the test-only instance (`src/server/auth/auth-test-instance.ts`, used
 * only by `scripts/check-auth.ts`). Kept in one place so the two instances
 * can never drift apart on anything that matters for a test to be
 * meaningful — the test instance adds only the `testUtils()` plugin and
 * drops `nextCookies()` (which needs a real Next.js request context that
 * scripts don't have).
 *
 * Not called at module-evaluation time (see `getAuth()` below): calling
 * this reads `serverEnv()`, and this module is imported by the
 * `/api/auth/[...all]` route handler, which `next build` loads to collect
 * route metadata. Deferring construction to first real use keeps that
 * collection pass from requiring every env var this schema lists, for
 * routes that have nothing to do with auth.
 *
 * Deliberately not typed `(): BetterAuthOptions` — annotating the return
 * type widens it to the general interface and erases the literal object
 * shape (the exact `additionalFields`, in particular) that `betterAuth()`
 * needs to infer `role`/`timeZone` onto the session's `user` type.
 * `satisfies` below checks the same thing without widening.
 */
export function buildAuthOptions() {
  const env = serverEnv();

  return {
    baseURL: resolveBaseURL(),
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: resolveTrustedOrigins(),

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      // Related writes (e.g. creating a user and its session together on
      // sign-up) commit atomically; our `pg` driver supports transactions.
      transaction: true,
    }),

    // Google is the only sign-in method (T-01c decision, 2026-11-06): no
    // passwords are stored. Default scopes only (`openid email profile`;
    // see node_modules/better-auth/dist/social-providers/google.mjs) — no
    // Gemini/Drive/etc. access is requested.
    socialProviders: {
      google: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      },
    },

    account: {
      // The stored Google access/refresh/id tokens (`account.accessToken`
      // etc.) are encrypted at rest with a key derived from
      // `BETTER_AUTH_SECRET`. The app never calls a Google API with these
      // tokens today, so there is no reason for them to sit in plaintext.
      encryptOAuthTokens: true,
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
        // Saved from the browser right after sign-in (PRD Section 4): the
        // bare sign-in page calls `updateUser({ timeZone })` with
        // `Intl.DateTimeFormat().resolvedOptions().timeZone` once signed
        // in, when the stored value is missing or different. Accepted on
        // update, but only a real IANA name is ever stored: the Standard
        // Schema validator rejects anything else before it reaches the
        // database.
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
    // everywhere, at the cost of one extra table (`rate_limit`). Google
    // sign-in still hits this: `/sign-in/social` matches Better Auth's
    // built-in `/sign-in*` rate-limit rule (3 requests / 10s) the same way
    // `/sign-in/email` used to.
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

    plugins: [
      oAuthProxy({
        productionURL: resolveProductionURL(),
        // Optional: when unset (local dev), the plugin derives its
        // encryption key from `secret` above instead. Required on Vercel
        // (checked in `serverEnv()`) because Production and every Preview
        // must share the same value for a Preview's proxied sign-in to
        // decrypt what Production encrypted.
        secret: env.OAUTH_PROXY_SECRET,
      }),
      // Lets the client exchange a Google Identity Services ID token
      // directly for a session (`/one-tap/callback`), instead of the
      // `/sign-in/social` redirect flow above. Verifies the ID token's
      // audience against this same client ID — no redirect, no callback
      // URL, so (unlike the redirect flow) this needs no oauth-proxy
      // involvement and works identically on every environment's own
      // origin. What *does* vary per environment is whether that origin
      // is in Google's "Authorized JavaScript origins" allowlist: Preview
      // deployments get a new, unpredictable domain each time, so the
      // client (src/lib/auth-client.ts) only renders this button on
      // Production and local dev, never Preview (decision 2026-11-07).
      oneTap({ clientId: env.GOOGLE_OAUTH_CLIENT_ID }),
    ],
  } satisfies BetterAuthOptions;
}

function buildAuth() {
  const options = buildAuthOptions();
  return betterAuth({
    ...options,
    plugins: [...options.plugins, nextCookies()],
  });
}

export function getAuth() {
  global.__auth ??= buildAuth();
  return global.__auth;
}

/**
 * Type-only handle on the real auth instance's exact shape, for
 * `inferAdditionalFields<Auth>()` on the browser client
 * (`src/lib/auth-client.ts`) — the only way the client's `updateUser()`
 * knows `timeZone` is a valid, student-settable field. Never imported for
 * its value: importing only the type never triggers `buildAuth()`.
 */
export type Auth = ReturnType<typeof buildAuth>;
