# AI Study Coach

AI-Powered Learning Analytics and Study Coach for Students.
Victoria University · NIT3003 Capstone 2 · Project 15.

Students upload study materials, confirm AI-suggested topics, generate cited quizzes and flashcards, track topic mastery, find weak topics and complete scheduled revision.

**Status:** in development. Built so far: the infrastructure connections (database, storage, jobs, AI), Google-only sign-in, the app shell and dashboard, and Study Spaces (create, rename, open, delete). Materials, AI generation, quizzes, flashcards, progress and revision are not built yet. See the task map in [PRD Section 5](docs/prd/05-build-workflow-evidence.md).

Live: <https://ai-study-coach-zeta.vercel.app/>

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

The app needs a Neon Postgres database (with pgvector), a private Vercel
Blob store, an Upstash QStash account, a Google AI Studio (Gemini) API key
and a Google OAuth client (sign-in is Google-only, so there's no password to
set up). Each developer uses their **own** development credentials, never
the project's Production ones (Security rule 10 in
[PRD Section 4](docs/prd/04-architecture-database.md)).

The app checks **every** variable when it starts. If one is missing, every
page and script fails, so complete all the steps below before running
anything.

**Who provides which credential:**

| Credential | Provided by |
| --- | --- |
| Neon connection strings for your own dev branch (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL_TEST`) | Arya creates your branch and sends them |
| Dev Google sign-in client (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`), localhost only | Arya sends them |
| Gemini API key | You: your own Google AI Studio key |
| QStash token and signing keys | You: your own free Upstash account |
| Blob read/write token | You: your own private Blob store in your own Vercel account (never the project's store) |
| `BETTER_AUTH_SECRET` | You: generate your own; never reuse anyone else's |

#### 1. Get your values from Arya

Arya does three things for you:

- Creates your own Neon branch, `dev-<your name>`, with a `dev` database and
  a separate `test` database.
- Adds your Google account as a **test user** in Google Cloud. While the
  sign-in consent screen is in "Testing", nobody else can sign in.
- Sends you, **privately**, your three Neon connection strings and the dev
  Google sign-in client's ID and secret. The dev client only works on
  `http://localhost:3000`, so it can't be used against Production.

Secrets travel only by a private message or a one-time link that expires
after opening, such as Bitwarden Send or a 1Password share link. **Never**
post them in the group chat, a GitHub issue or PR, or a commit.

#### 2. Create your own credentials

- **Gemini:** create an API key in [Google AI Studio](https://aistudio.google.com/).
  Use the same model names as the team (ask Arya; they aren't secret). The
  embedding model must stay `gemini-embedding-001`, because the database
  stores 768-dimension vectors (PRD Section 3).
- **QStash:** sign up at [Upstash](https://console.upstash.com/), open
  QStash, and copy the token plus the current and next signing keys (and
  `QSTASH_URL` if the console lists one).
- **Blob:** in your own [Vercel](https://vercel.com/) account, go to
  Storage, create a Blob store with **private** access, and copy its
  read/write token.
- **Better Auth secret:** run `npx auth secret`, or use any random string of
  32 or more characters.

#### 3. Create `.env.local`

Create a file called `.env.local` in the project root (Git ignores it, so
it's never committed) and fill in every value:

```bash
# Neon: your own dev branch (from Arya)
DATABASE_URL=           # dev database, pooled connection string
DATABASE_URL_UNPOOLED=  # dev database, direct connection string (migrations)
DATABASE_URL_TEST=      # test database on the same branch

# Private Blob (your own store)
BLOB_READ_WRITE_TOKEN=

# QStash (your own Upstash account)
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
# QSTASH_URL=           # only if the Upstash console shows one for your region

# AI (your own Gemini key; model names from Arya)
AI_PROVIDER=gemini
GOOGLE_GENERATIVE_AI_API_KEY=
AI_MODEL_GENERATE=
AI_MODEL_CHECK=
AI_MODEL_EMBED=gemini-embedding-001

# Better Auth
BETTER_AUTH_SECRET=     # your own, 32+ characters
BETTER_AUTH_URL=http://localhost:3000

# Google sign-in: the dev client (from Arya)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

`OAUTH_PROXY_SECRET` isn't needed locally; only Vercel Production and Preview
use it. The full list of variable names is in
[PRD Section 4](docs/prd/04-architecture-database.md#environment-variables).

#### 4. Set up your databases

Run the migrations on your dev **and** test databases. The test database
needs its **direct** address: take `DATABASE_URL_TEST` and remove `-pooler`
from the host name.

```bash
pnpm run db:migrate   # dev database (reads .env.local)
```

Then the test database. In Git Bash:

```bash
DATABASE_URL_UNPOOLED="<test database direct address>" pnpm exec drizzle-kit migrate
```

Or in PowerShell:

```powershell
$env:DATABASE_URL_UNPOOLED = "<test database direct address>"; pnpm exec drizzle-kit migrate; Remove-Item Env:DATABASE_URL_UNPOOLED
```

Never run migrations against the Neon `main` branch: that's Production.
Vercel migrates it automatically on deploy.

#### 5. Check everything works

```bash
pnpm run check:connections   # database, Blob, QStash, Gemini
pnpm run check:auth          # sessions, sign-out, Google sign-in URL, rate limiting
pnpm run check:spaces        # Study Space create, rename, delete and ownership
```

Each one prints only pass/fail lines and short, safe messages, never a
secret or session token. They create and delete their own test users and
never touch real accounts.

Google sign-in itself can't be scripted, so check it by hand: run `pnpm dev`,
open <http://localhost:3000/sign-in> and click "Continue with Google". If
Google says access is blocked, ask Arya to add your account as a test user.

If a secret is ever posted somewhere public or committed by mistake, tell
Arya straight away so it can be replaced.

## Team

| Member | Role |
| --- | --- |
| Arya | Project Lead · Infrastructure, Authentication and Frontend |
| Rashid | Technical Lead · Backend Features |
| Khushi | Cybersecurity & Management Lead |
| Chami | Documentation & Planning |
