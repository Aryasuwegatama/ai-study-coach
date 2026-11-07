# AI Study Coach

AI-Powered Learning Analytics and Study Coach for Students.
Victoria University · NIT3003 Capstone 2 · Project 15.

Students upload study materials, confirm AI-suggested topics, generate cited quizzes and flashcards, track topic mastery, find weak topics and complete scheduled revision.

**Status:** early development. The Next.js scaffold, a starter deployment, the initial infrastructure connections (database, storage, jobs, AI) and the Better Auth backend (Google sign-in only, sessions) exist, along with a bare sign-in page and a public privacy policy page; the styled screens and product features are not built yet. See the task map in [PRD Section 5](docs/prd/05-build-workflow-evidence.md).

Live (starter deployment): <https://ai-study-coach-zeta.vercel.app/>

## Documentation

- [`docs/prd/`](docs/prd/): the five PRD v1.2 sections, the source of truth for requirements
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md): workflow, commands, folder structure and rules for working in this repo

## Stack

Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, shadcn/ui, pnpm, Better Auth (Google sign-in only — no passwords are stored), Neon Postgres with pgvector, Drizzle ORM, Vercel Private Blob, Upstash QStash, Vercel AI SDK with Google Gemini.
Planned: Vitest, Playwright, axe, k6.

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

### Environment setup (new contributors)

The app needs a Neon Postgres database (with pgvector), a Vercel Private Blob
store, an Upstash QStash account, a Google AI Studio (Gemini) API key and a
Google OAuth client (sign-in is Google-only — there is no password to set
up). Each developer uses their **own** development credentials, never the
project's production ones (see Security rule 10 in
[PRD Section 4](docs/prd/04-architecture-database.md)).

**Who provides which credential:**

| Credential | Provided by |
| --- | --- |
| Neon dev branch connection strings (`DATABASE_URL*`) | Arya |
| Dev Google OAuth client (`GOOGLE_OAUTH_CLIENT_ID`/`SECRET`, localhost-only) | Arya |
| Gemini API key | Each developer, their own Google AI Studio key |
| Upstash QStash token and signing keys | Each developer, their own account |
| Vercel Blob read/write token | Each developer, their own store |
| `BETTER_AUTH_SECRET` | Each developer generates their own; never shared across environments |

Ask Arya for the dev Google OAuth client's values privately (never in an
issue, PR or chat channel everyone can see) — it only allows
`http://localhost:3000` as a redirect and as an authorized origin, so it
can't be used against Production. Your Google account also needs to be
added as a **test user** in Google Cloud (Arya does this) while the
consent screen is in "Testing".

1. Create a `.env.local` file (git-ignored) in the project root with the
   variable names listed in [PRD Section 4](docs/prd/04-architecture-database.md#environment-variables),
   "Environment variables".
   - **Neon:** create your own branch (e.g. `dev-<name>`) with a dev
     database and a separate `test` database. `DATABASE_URL` is the pooled
     connection string; `DATABASE_URL_UNPOOLED` is the same branch's direct
     string (used for migrations); `DATABASE_URL_TEST` is the `test`
     database on the same branch.
   - **Blob:** create a token scoped to the project's Blob store.
   - **QStash:** get your token and signing keys from the Upstash console.
   - **Gemini:** create an API key in Google AI Studio, and pick model IDs
     that are currently available to your account — deprecated IDs fail
     with a clear error naming the replacement.
   - **Better Auth:** generate your own `BETTER_AUTH_SECRET` (`npx auth
     secret`, or any random 32+ character string — never reuse Production's
     or Preview's), and set `BETTER_AUTH_URL=http://localhost:3000`.
   - **Google sign-in:** set `GOOGLE_OAUTH_CLIENT_ID` and
     `GOOGLE_OAUTH_CLIENT_SECRET` to the dev OAuth client's values (see
     above) — that's the only value to set; `next.config.ts` re-exposes the
     client ID to the browser itself for the Google Identity Services
     sign-in button, since it isn't a secret. `OAUTH_PROXY_SECRET` is not
     needed locally — only Vercel Production and Preview need it, and
     share one value.
2. Run the existing migrations (pgvector, then the Better Auth tables) on
   your dev **and** test databases:
   ```bash
   pnpm run db:migrate                              # dev (uses .env.local)
   DATABASE_URL_UNPOOLED=<test-db-unpooled-url> pnpm exec drizzle-kit migrate
   ```
3. Verify every service is actually reachable:
   ```bash
   pnpm run check:connections   # database, Blob, QStash, Gemini
   pnpm run check:auth          # sessions, sign-out, Google sign-in URL, rate limiting
   ```
   Both print only pass/fail and short, safe messages — never a secret,
   session token or password. `check:auth` creates and deletes its own
   test user and test rate-limit rows; it never touches real student
   accounts. Real Google sign-in can't be scripted — check that by hand:
   run `pnpm dev`, open <http://localhost:3000/sign-in> and click
   "Continue with Google".

## Team

| Member | Role |
| --- | --- |
| Arya | Project Lead · Infrastructure, Authentication and Frontend |
| Rashid | Technical Lead · Backend Features |
| Khushi | Cybersecurity & Management Lead |
| Chami | Documentation & Planning |
