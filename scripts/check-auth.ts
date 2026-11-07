#!/usr/bin/env tsx
/**
 * Verifies the T-01c Google-only Better Auth backend end to end, against
 * the real dev database. Real Google sign-in can't be scripted — there is
 * no password or form to submit — so this uses a test-only auth instance
 * (`buildTestAuth()`, built from the exact same options as the real app;
 * see src/server/auth/auth-test-instance.ts) and its `testUtils()` plugin to create
 * a user and a valid session directly, the way a finished Google sign-in
 * would have left them. `requireUser()` is then exercised exactly as the
 * app uses it, against the production `getAuth()` instance: both
 * instances share one secret and one database, so a session the test
 * instance creates is a real, valid session row the production instance
 * recognises.
 *
 * Prints only pass/fail and short, safe messages — never a session token,
 * cookie or secret. Deletes only the one user it creates (by ID) and only
 * the rate-limit rows keyed to its own synthetic test IPs — never every
 * `/sign-*` row, which would have cleared a real, concurrent request's
 * rate-limit counter too (PR #6 review).
 *
 * Run with: pnpm run check:auth
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { like } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { requireUser } from "../src/server/auth/auth-session";
import { toErrorResponse } from "../src/lib/api-errors";
import { db } from "../src/server/db/db-client";
import { rateLimit as rateLimitTable } from "../src/server/db/schema";

type CheckResult = { name: string; ok: boolean; message: string };

const BASE_URL = "http://localhost:3000";
// RFC 5737 TEST-NET-3 — never a real client address, so rate-limit rows
// keyed to it can never belong to anyone but this script.
const TEST_IP_PREFIX = "203.0.113.";
const RATE_LIMIT_TEST_IP = "198.51.100.42";

const results: CheckResult[] = [];
let ipCounter = 1;

function check(name: string, ok: boolean, message: string) {
  results.push({ name, ok, message });
}

/** Strips anything that could resemble a secret/token before printing it. */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}

async function main() {
  const testAuth = buildTestAuth();
  const ctx = await testAuth.$context;
  const test = ctx.test;

  /**
   * Each check gets its own synthetic client IP by default, so unrelated
   * checks never share Better Auth's built-in `/sign-in*` rate-limit
   * bucket (3 requests per 10 seconds, per IP) and trip each other up.
   * Pass a fixed `ip` only where that sharing is the point (the rate-limit
   * check itself). `Origin` is set to the app's own base URL, matching
   * what a same-origin browser request sends — some endpoints (e.g.
   * sign-out) reject state-changing requests without it.
   */
  function authRequest(path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("origin", BASE_URL);
    headers.set("x-forwarded-for", init.ip ?? `${TEST_IP_PREFIX}${(++ipCounter % 254) || 1}`);
    if (init.cookie) headers.set("cookie", init.cookie);
    return testAuth.handler(new Request(`${BASE_URL}/api/auth${path}`, { ...init, headers }));
  }

  const stamp = Date.now();

  // 1. Create a user and a session the way a finished Google sign-in would
  // have left them (testUtils writes directly to the database — no HTTP
  // round trip, no Google involved).
  const user = test.createUser({
    email: `check-auth-${stamp}@example.com`,
    name: "Check Auth",
    role: "student",
  });
  const savedUser = await test.saveUser(user);
  check("Create test user", !!savedUser.id, savedUser.id ? "created" : "not created");

  const { headers: loginHeaders, cookies } = await test.login({ userId: savedUser.id });
  const cookie = loginHeaders.get("cookie") ?? undefined;

  // 2. Session cookie attributes (Security rule 9). Secure can't be
  // observed over plain http://localhost; check it manually on a deployed
  // HTTPS preview or production.
  const sessionCookie = cookies[0];
  check(
    "Session cookie attributes",
    !!sessionCookie?.httpOnly && (sessionCookie?.sameSite === "Lax" || sessionCookie?.sameSite === "Strict"),
    `httpOnly=${sessionCookie?.httpOnly}, sameSite=${sessionCookie?.sameSite} (Secure: verify on a deployed HTTPS URL, not checkable over http://localhost)`,
  );

  // 3. requireUser() with the real session cookie — the exact helper
  // every protected route calls.
  const authedRequest = new Request(`${BASE_URL}/api/spaces`, {
    headers: cookie ? { cookie } : {},
  });
  try {
    const sessionUser = await requireUser(authedRequest);
    check(
      "requireUser() with a session",
      sessionUser.id === savedUser.id,
      `resolved user ${sessionUser.id === savedUser.id ? "matches" : "does not match"}`,
    );
  } catch (error) {
    check("requireUser() with a session", false, safeMessage(error));
  }

  // 4. requireUser() with no session: ApiError -> 401 in the PRD error format.
  try {
    await requireUser(new Request(`${BASE_URL}/api/spaces`));
    check("requireUser() with no session", false, "did not throw");
  } catch (error) {
    const response = toErrorResponse(error);
    const body = await response.json();
    check(
      "requireUser() with no session",
      response.status === 401 && body?.error?.code === "UNAUTHORIZED",
      `status ${response.status}, code ${body?.error?.code}`,
    );
  }

  // 5. role sent to /update-user is rejected (Security rule 1): `role` has
  // `input: false` with a `defaultValue`, which only applies on sign-up —
  // on update it has no default to fall back to, so Better Auth rejects
  // the whole request with FIELD_NOT_ALLOWED instead of silently dropping
  // the field.
  const roleRes = await authRequest("/update-user", {
    method: "POST",
    cookie,
    body: JSON.stringify({ role: "admin" }),
  });
  const roleBody = await roleRes.json();
  check(
    "role rejected on update",
    roleRes.status === 400 && roleBody?.code === "FIELD_NOT_ALLOWED",
    `status ${roleRes.status}, code ${roleBody?.code}`,
  );

  // 6. Valid time zone ("UTC" — the case PR #6 review flagged as wrongly
  // rejected) is accepted. `/update-user` only returns `{ status: true }`
  // on success, so the stored value is confirmed separately below.
  const utcRes = await authRequest("/update-user", {
    method: "POST",
    cookie,
    body: JSON.stringify({ timeZone: "UTC" }),
  });
  const utcBody = await utcRes.json();
  check(
    "Valid time zone (UTC) accepted",
    utcRes.status === 200 && utcBody?.status === true,
    `status ${utcRes.status}`,
  );

  // 7. Invalid time zone rejected, and doesn't overwrite the value above.
  const badTzRes = await authRequest("/update-user", {
    method: "POST",
    cookie,
    body: JSON.stringify({ timeZone: "Mars/Base" }),
  });
  check("Invalid time zone rejected", badTzRes.status === 400, `status ${badTzRes.status}`);

  const sessionAfterTz = await testAuth.api.getSession({ headers: new Headers(cookie ? { cookie } : {}) });
  check(
    "Time zone stored as UTC",
    sessionAfterTz?.user?.timeZone === "UTC",
    `stored as "${sessionAfterTz?.user?.timeZone}"`,
  );

  // 8. Sign out invalidates the session.
  if (cookie) {
    await authRequest("/sign-out", { method: "POST", cookie });
    const afterSignOut = await testAuth.api.getSession({ headers: new Headers({ cookie }) });
    check("Sign out", afterSignOut === null, afterSignOut ? "session still valid" : "session cleared");
  }

  // 9. Email/password sign-up and sign-in are disabled (T-01c: Google is
  // the only sign-in method).
  const signUpRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: `nobody-${stamp}@example.com`, password: "irrelevant1", name: "Nobody" }),
  });
  const signUpBody = await signUpRes.json();
  check(
    "Email/password sign-up disabled",
    signUpRes.status === 400 && signUpBody?.code === "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    `status ${signUpRes.status}, code ${signUpBody?.code}`,
  );

  const signInRes = await authRequest("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email: `nobody-${stamp}@example.com`, password: "irrelevant1" }),
  });
  const signInBody = await signInRes.json();
  check(
    "Email/password sign-in disabled",
    signInRes.status === 400 && signInBody?.code === "EMAIL_PASSWORD_DISABLED",
    `status ${signInRes.status}, code ${signInBody?.code}`,
  );

  // 10. /sign-in/social returns a real Google authorization URL with state
  // and a PKCE challenge — `disableRedirect` keeps the response as plain
  // JSON instead of a 302 so this is a simple, offline check (no network
  // call to Google: createAuthorizationURL() only builds the URL).
  const socialRes = await authRequest("/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", disableRedirect: true, callbackURL: "/sign-in" }),
  });
  const socialBody = await socialRes.json();
  let authorizationURLOk = false;
  if (typeof socialBody?.url === "string") {
    const url = new URL(socialBody.url);
    authorizationURLOk =
      url.hostname === "accounts.google.com" &&
      !!url.searchParams.get("state") &&
      !!url.searchParams.get("code_challenge") &&
      url.searchParams.get("code_challenge_method") === "S256";
  }
  check(
    "Google authorization URL has state and PKCE",
    socialRes.status === 200 && authorizationURLOk,
    authorizationURLOk ? "accounts.google.com URL with state + code_challenge" : `status ${socialRes.status}`,
  );

  // 11. Rate limiting on repeated social sign-in requests (Better Auth's
  // built-in rule for /sign-in*: 3 attempts per 10-second window — the
  // same rule /sign-in/email used to hit). Needs a fixed client IP to key
  // the limit per-client; Vercel always sets x-forwarded-for.
  let rateLimited = false;
  for (let attempt = 1; attempt <= 6 && !rateLimited; attempt++) {
    const res = await authRequest("/sign-in/social", {
      method: "POST",
      ip: RATE_LIMIT_TEST_IP,
      body: JSON.stringify({ provider: "google", disableRedirect: true, callbackURL: "/sign-in" }),
    });
    if (res.status === 429) rateLimited = true;
  }
  check(
    "Rate limit hit on repeated sign-in/social requests",
    rateLimited,
    rateLimited ? "429 after a few attempts" : "never hit 429 in 6 attempts",
  );

  // Clean up: the one user this run created, and only the rate-limit rows
  // keyed to this run's own synthetic test IPs (never every `/sign-*` row
  // — that would also clear a real, concurrent request's counter).
  await test.deleteUser(savedUser.id);
  await db.delete(rateLimitTable).where(like(rateLimitTable.key, `${TEST_IP_PREFIX}%`));
  await db.delete(rateLimitTable).where(like(rateLimitTable.key, `${RATE_LIMIT_TEST_IP}|%`));
  check("Cleanup", true, "removed the test user and this run's rate-limit rows");

  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.message}`);
  }
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main();
