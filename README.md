# AI Study Coach

AI-Powered Learning Analytics and Study Coach for Students.
Victoria University · NIT3003 Capstone 2 · Project 15.

Students upload study materials, confirm AI-suggested topics, generate cited quizzes and flashcards, track topic mastery, find weak topics and complete scheduled revision.

**Status:** early development. The Next.js scaffold and a starter deployment exist; authentication, database, AI and product features are not built yet. See the task map in [PRD Section 5](docs/prd/05-build-workflow-evidence.md).

Live (starter deployment): <https://ai-study-coach-zeta.vercel.app/>

## Documentation

- [`docs/prd/`](docs/prd/): the five PRD v1.2 sections, the source of truth for requirements
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md): workflow, commands, folder structure and rules for working in this repo

## Stack

Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, shadcn/ui, pnpm.
Planned: Better Auth, Neon Postgres with pgvector, Drizzle ORM, Vercel Private Blob, Upstash QStash, Vercel AI SDK with Google Gemini, Vitest, Playwright, axe, k6.

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Environment setup will be documented here once services are configured.

## Team

| Member | Role |
| --- | --- |
| Arya | Project Lead · Infrastructure, Authentication and Frontend |
| Rashid | Technical Lead · Backend Features |
| Khushi | Cybersecurity & Management Lead |
| Chami | Documentation & Planning |
