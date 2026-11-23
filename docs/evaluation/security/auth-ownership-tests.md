# T-07b: auth, session and Study Space tests

Issue: https://github.com/Aryasuwegatama/ai-study-coach/issues/20

## Running the suite

1. Install dependencies with `pnpm install`.
2. Set `DATABASE_URL_TEST` in your local environment or git-ignored `.env.local` to a dedicated PostgreSQL test database with pgvector available. Never supply a Production database. The setup rejects a target matching `DATABASE_URL` or `DATABASE_URL_UNPOOLED`, including Neon pooled/direct aliases. This check cannot identify an otherwise unlabelled Production URL: provisioning a dedicated test database remains the contributor's responsibility.
3. Run `pnpm test` twice. Both runs must pass before recording repeatability.
4. Run `pnpm exec eslint .`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm check:auth` and `pnpm check:spaces`. The existing check scripts require the full development configuration and use the development database; the integration suite uses only the test database.

The setup sets both application database URLs before application modules load, applies every checked-in Drizzle migration, and uses local dummy credentials for external services. Tests create real Better Auth sessions without calling Google. No database, session or ownership helpers are mocked. Files run sequentially and each test creates fresh students. Cleanup deletes only those students (with cascading child rows) and the exact synthetic rate-limit keys created by its requests; it never truncates tables. Pools close after each file. A forcibly terminated process can leave synthetic rows behind; cleanup is guaranteed for normal assertion failures, not process termination.

## Case mapping

These IDs match the catalogue proposed in [T-07a PR #51](https://github.com/Aryasuwegatama/ai-study-coach/pull/51). That PR's review is pending; retain the IDs and reconcile any requested catalogue changes before merge.

| ID | Security rule | Coverage |
| --- | --- | --- |
| SEC-AUTH-01 | 1, 2 | Valid sessions resolve the correct student |
| SEC-AUTH-02 | 2, 9 | Missing, forged, expired and signed-out sessions get the exact 401 body for every student API method |
| SEC-AUTH-03 | 9 | Email/password sign-up and login are disabled |
| SEC-AUTH-04 | 1 | Role elevation and user identity tampering fail |
| SEC-AUTH-05 | 9 | HttpOnly and SameSite session cookie attributes |
| SEC-AUTH-06 | 2 | Route registry stays in sync with current student API modules |
| SEC-SPACE-01 | 2 | Lists isolate two students' spaces |
| SEC-SPACE-02 | 2 | Cross-owner rename/delete give 404 and leave the entire row unchanged |
| SEC-SPACE-03 | 2 | Missing, malformed, empty, deleted and foreign IDs give identical 404 bodies, including `requireSpace()` |
| SEC-SPACE-04 | 1, 2 | Client ownerId/userId/role cannot assign ownership or privileges |
| SEC-SPACE-05 | 2 | Owner rename/delete works; deletion immediately blocks list/read/write access and preserves the soft-deleted row |

The API registry excludes public `/api/auth/*` endpoints and the signed QStash `/api/jobs/step` callback. Later upload, AI and scoring ownership cases remain T-10/T-13/T-16 scope; only their unauthenticated API boundary is exercised here. Empty IDs are tested by directly invoking the parameterised handler; HTTP `/api/spaces/` resolves to the collection route, not a missing-ID resource route.

## Protected pages and remaining HTTPS check

Run the app with its own development database and real local credentials. Use two separate browser profiles signed in as Student A and Student B; create a distinctively named space as A.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| SEC-PAGE-01 | Signed out, request `/dashboard`, `/spaces`, and `/spaces/<A-space-id>/overview` | Redirect to `/sign-in` | Passed over HTTP, 23 Nov |
| SEC-PAGE-02 | As B, open A's Overview; inspect the full HTTP response, page title and breadcrumb | Not-found screen; no occurrence of A's space name. Streamed responses may have status 200 | Passed over HTTP with an owner-positive control, 23 Nov |
| SEC-PAGE-03 | As A, delete the space; request its Overview again | Not found, no name disclosed | Passed over HTTP, 23 Nov |
| SEC-COOKIE-01 | On an HTTPS Preview deployment, inspect the real Google sign-in response's session Set-Cookie | Secure, HttpOnly, SameSite=Lax or Strict | Not run |

Do not copy real cookies, credentials or personal data into evidence. Record only anonymised pass/fail results. The optional `auth-protected-pages.test.ts` suite starts an owned local production-build server with the test setup's settings and session secret, checks the full HTML/streamed payload, cleans up synthetic users, and stops the server. Run after building with `$env:AUTH_PAGE_TESTS = '1'; pnpm test`; remove that environment flag afterwards. Without the flag those two tests are explicitly skipped because a current build/server is required. The deployed HTTPS cookie check remains manual and unverified.

## Review and completion

Application code, migrations and `scripts/check-*.ts` are unchanged. The shared configuration change adds Vitest and `pnpm test`; Arya should review it alongside the tests. If a test uncovers an application bug, report it to Arya and link its issue before marking it known-failing; do not repair application code in this task. Do not claim #20 complete until live tests, repeatability, manual checks, T-07a ID reconciliation and the required PR workflow are verified.

## Local verification — 19 November 2026

| Check | Result |
| --- | --- |
| `pnpm exec next typegen` | Passed |
| `pnpm exec eslint .` | Passed |
| `pnpm exec tsc --noEmit` | Passed after generating Next route types |
| `git diff --check` | Passed |
| `pnpm test` without a test URL | Correctly refused to run with `DATABASE_URL_TEST is required`; no integration assertions ran |
| `pnpm build` | Compilation and TypeScript passed; prerendering `/sign-in` stopped because the existing app environment variables are missing |
| `pnpm check:auth`, `pnpm check:spaces` | Both stopped because the existing app environment variables are missing |
| Live integration assertions and second-run cleanup | Not verified: no test database configured |
| Protected pages and HTTPS cookie | Not run; steps above |

## Database verification — 23 November 2026

- Read-only preflight confirmed the server database is the separate `test` database and pgvector is available. Applied the 12 checked-in migrations there; no development/Production database was migrated.
- All 14 auth/space cases passed twice against it. The API registry now includes current Plan, mistake-check, reporting and flashcard endpoints instead of removed revision endpoints.
- The two optional protected-page HTTP cases passed using real synthetic sessions and an owned local build server. They assert signed-out redirects, the owner's name-positive control, foreign Overview privacy and immediate post-delete privacy in the entire response.
- The original auth and space check scripts passed, using the test database and temporary synthetic non-database settings. This included state/PKCE URL generation and rate limiting, not a real Google login.
- Missing test URL, same database, pooled/direct aliases and a Production environment all refused to run in subprocess checks with synthetic unreachable endpoints. No app database was contacted for those checks.
- No synthetic test users remained after cleanup. Passwords, connection strings and cookies were not written into evidence; `.env.local` remains ignored.
- Final combined runs with `AUTH_PAGE_TESTS=1`: **16/16 passed twice**, including the HTTP cases, approximately 35 seconds per run. Lint, TypeScript and the current production build passed. The build used temporary synthetic settings rather than a full developer configuration; no real AI/storage/OAuth calls were needed.
- Review, case-catalogue approval and the deployed HTTPS cookie check remain outstanding. The automated tests and HTTP verification do not constitute a real Google sign-in or a deployed Secure-cookie check.
