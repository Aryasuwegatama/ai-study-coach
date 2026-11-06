# AI Study Coach

AI-Powered Learning Analytics and Study Coach for Students.
Victoria University · NIT3003 Capstone 2 · Project 15.

Students upload study materials, confirm AI-suggested topics, generate cited quizzes and flashcards, track topic mastery, find weak topics and complete scheduled revision.

**Status:** early development. The Next.js scaffold, a starter deployment, the initial infrastructure connections (database, storage, jobs, AI) and the Better Auth backend (email/password sign-up, sign-in, sessions) exist; the sign-in/sign-up screens and product features are not built yet. See the task map in [PRD Section 5](docs/prd/05-build-workflow-evidence.md).

Live (starter deployment): <https://ai-study-coach-zeta.vercel.app/>

## Documentation

- [`docs/prd/`](docs/prd/): the five PRD v1.2 sections, the source of truth for requirements
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md): workflow, commands, folder structure and rules for working in this repo

## Stack

Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, shadcn/ui, pnpm, Better Auth (email/password, Argon2id), Neon Postgres with pgvector, Drizzle ORM, Vercel Private Blob, Upstash QStash, Vercel AI SDK with Google Gemini.
Planned: Vitest, Playwright, axe, k6.

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

### Environment setup (new contributors)

The app needs a Neon Postgres database (with pgvector), a Vercel Private Blob
store, an Upstash QStash account and a Google AI Studio (Gemini) API key.
Each developer uses their **own** development credentials, never the
project's production ones (see Security rule 10 in
[PRD Section 4](docs/prd/04-architecture-database.md)).

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
2. Run the existing migrations (pgvector, then the Better Auth tables) on
   your dev **and** test databases:
   ```bash
   pnpm run db:migrate                              # dev (uses .env.local)
   DATABASE_URL_UNPOOLED=<test-db-unpooled-url> pnpm exec drizzle-kit migrate
   ```
3. Verify every service is actually reachable:
   ```bash
   pnpm run check:connections   # database, Blob, QStash, Gemini
   pnpm run check:auth          # sign-up, sign-in, sign-out, sessions, rate limiting
   ```
   Both print only pass/fail and short, safe messages — never a secret,
   session token or password. `check:auth` creates and deletes its own
   test users; it never touches real student accounts.

## Team

| Member | Role |
| --- | --- |
| Arya | Project Lead · Infrastructure, Authentication and Frontend |
| Rashid | Technical Lead · Backend Features |
| Khushi | Cybersecurity & Management Lead |
| Chami | Documentation & Planning |
