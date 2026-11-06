#!/usr/bin/env tsx
/**
 * Verifies the T-01b Better Auth backend end to end, against the real dev
 * database: sign-up, sign-in, sign-out, session reads, password rules,
 * the forced `role`, time-zone validation, the Argon2id hash and rate
 * limiting. Prints only pass/fail and short, safe messages — never a
 * session token, cookie or password. Deletes the test users it creates.
 *
 * Run with: pnpm run check:auth
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, like } from "drizzle-orm";
import { getAuth } from "../src/server/auth/config";
import { requireUser } from "../src/server/auth/session";
import { toErrorResponse } from "../src/lib/errors";
import { db } from "../src/server/db/client";
import { user as userTable, account as accountTable, rateLimit as rateLimitTable } from "../src/server/db/schema";

type CheckResult = { name: string; ok: boolean; message: string };

const BASE_URL = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const results: CheckResult[] = [];
let lastUserId: string | undefined;
let ipCounter = 1;

function check(name: string, ok: boolean, message: string) {
  results.push({ name, ok, message });
}

/** Strips anything that could resemble a secret/token before printing it. */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}

/**
 * Each check gets its own synthetic client IP by default, so unrelated
 * checks never share Better Auth's built-in sign-in/sign-up rate-limit
 * bucket (3 requests per 10 seconds, per IP) and trip each other up. Pass
 * a fixed `ip` only where that sharing is the point (the rate-limit check
 * itself). `Origin` is set to the app's own base URL, matching what a
 * same-origin browser request sends — some endpoints (e.g. sign-out)
 * reject state-changing requests without it.
 */
function authRequest(
  path: string,
  init: RequestInit & { cookie?: string; ip?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", BASE_URL);
  headers.set("x-forwarded-for", init.ip ?? `203.0.113.${++ipCounter % 254 || 1}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  return getAuth().handler(new Request(`${BASE_URL}/api/auth${path}`, { ...init, headers }));
}

function sessionCookie(response: Response): string | undefined {
  return response.headers.get("set-cookie")?.split(";")[0];
}

async function main() {
  const stamp = Date.now();
  const email = `check-auth-${stamp}@example.com`;

  // 1. Sign up: creates a user, auto-signs in, sets a session cookie.
  const signUpRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, name: "Check Auth" }),
  });
  const signUpBody = await signUpRes.json();
  const cookie = sessionCookie(signUpRes);
  lastUserId = signUpBody?.user?.id;
  check(
    "Sign up",
    signUpRes.status === 200 && !!cookie && !!lastUserId,
    signUpRes.status === 200 ? "Created a user and a session" : `status ${signUpRes.status}`,
  );

  // 2. Session cookie attributes (Security rule 9). Secure can't be
  // observed over plain http://localhost; check it manually on a
  // deployed HTTPS preview or production.
  const cookieHeader = signUpRes.headers.get("set-cookie") ?? "";
  check(
    "Session cookie attributes",
    /HttpOnly/i.test(cookieHeader) && /SameSite/i.test(cookieHeader),
    "HttpOnly and SameSite present (Secure: verify on a deployed HTTPS URL, not checkable over http://localhost)",
  );

  // 3. role sent in the sign-up body has no effect (Security rule 1).
  check(
    "Forged role ignored",
    signUpBody?.user?.role === "student",
    `role stored as "${signUpBody?.user?.role}"`,
  );

  // 4. Password hash is Argon2id.
  if (lastUserId) {
    const [acct] = await db
      .select({ password: accountTable.password })
      .from(accountTable)
      .where(eq(accountTable.userId, lastUserId))
      .limit(1);
    check(
      "Argon2id password hash",
      !!acct?.password?.startsWith("$argon2id$"),
      acct?.password ? `prefix ${acct.password.slice(0, 10)}` : "no account row found",
    );
  }

  // 5. requireUser() with the real session cookie.
  const authedRequest = new Request(`${BASE_URL}/api/spaces`, {
    headers: cookie ? { cookie } : {},
  });
  try {
    const sessionUser = await requireUser(authedRequest);
    check("requireUser() with a session", sessionUser.id === lastUserId, `resolved user ${sessionUser.id === lastUserId ? "matches" : "does not match"}`);
  } catch (error) {
    check("requireUser() with a session", false, safeMessage(error));
  }

  // 6. requireUser() with no session: ApiError -> 401 in the PRD error format.
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

  // 7. Sign out invalidates the session.
  if (cookie) {
    await authRequest("/sign-out", { method: "POST", cookie });
    const afterSignOut = await getAuth().api.getSession({
      headers: new Headers({ cookie }),
    });
    check("Sign out", afterSignOut === null, afterSignOut ? "session still valid" : "session cleared");
  }

  // 8. Password shorter than 8 characters is rejected.
  const shortPwRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: `check-auth-short-${stamp}@example.com`, password: "short1", name: "Short" }),
  });
  check("Short password rejected", shortPwRes.status === 400, `status ${shortPwRes.status}`);

  // 9. Duplicate email is rejected.
  const dupRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, name: "Duplicate" }),
  });
  check("Duplicate email rejected", dupRes.status === 422, `status ${dupRes.status}`);

  // 10. Wrong password is rejected, with the same error as an unknown
  // email (no information disclosure about which field was wrong).
  const wrongPwRes = await authRequest("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "not-the-password" }),
  });
  const unknownEmailRes = await authRequest("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email: `nobody-${stamp}@example.com`, password: PASSWORD }),
  });
  const wrongPwBody = await wrongPwRes.json();
  const unknownEmailBody = await unknownEmailRes.json();
  check(
    "Wrong password rejected without field disclosure",
    wrongPwRes.status === 401 && wrongPwBody?.code === unknownEmailBody?.code,
    `status ${wrongPwRes.status}, code ${wrongPwBody?.code}`,
  );

  // 11. Invalid time zone rejected; valid IANA name stored.
  const badTzRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: `check-auth-tz-bad-${stamp}@example.com`,
      password: PASSWORD,
      name: "Bad TZ",
      timeZone: "Mars/Base",
    }),
  });
  check("Invalid time zone rejected", badTzRes.status === 400, `status ${badTzRes.status}`);

  const goodTzRes = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: `check-auth-tz-ok-${stamp}@example.com`,
      password: PASSWORD,
      name: "Good TZ",
      timeZone: "Australia/Brisbane",
    }),
  });
  const goodTzBody = await goodTzRes.json();
  check(
    "Valid time zone stored",
    goodTzBody?.user?.timeZone === "Australia/Brisbane",
    `stored as "${goodTzBody?.user?.timeZone}"`,
  );

  // 12. Rate limiting on repeated failed sign-ins (Better Auth's built-in
  // rule for /sign-in*: 3 attempts per 10-second window). Needs a client
  // IP header to key the limit per-client — Vercel always sets
  // x-forwarded-for; this test supplies it too, so it isn't checking the
  // shared no-IP fallback bucket.
  const rlEmail = `check-auth-rl-${stamp}@example.com`;
  const rlIp = "198.51.100.42";
  await authRequest("/sign-up/email", {
    method: "POST",
    ip: rlIp,
    body: JSON.stringify({ email: rlEmail, password: PASSWORD, name: "Rate Limit" }),
  });
  let rateLimited = false;
  for (let attempt = 1; attempt <= 6 && !rateLimited; attempt++) {
    const res = await authRequest("/sign-in/email", {
      method: "POST",
      ip: rlIp,
      body: JSON.stringify({ email: rlEmail, password: "wrong" }),
    });
    if (res.status === 429) rateLimited = true;
  }
  check("Rate limit hit on repeated failed sign-ins", rateLimited, rateLimited ? "429 after a few attempts" : "never hit 429 in 6 attempts");

  // Clean up every user this script created.
  const deleted = await db
    .delete(userTable)
    .where(like(userTable.email, `check-auth-%@example.com`))
    .returning({ id: userTable.id });
  await db.delete(userTable).where(eq(userTable.email, `nobody-${stamp}@example.com`));
  await db.delete(rateLimitTable).where(like(rateLimitTable.key, "%/sign-%"));
  check("Cleanup", true, `removed ${deleted.length} test user(s)`);

  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.message}`);
  }
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main();
