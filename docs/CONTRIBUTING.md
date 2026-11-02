# Contributing to AI Study Coach

This guide is for team members and the AI coding agents they use. Read it before starting any task.

## Where the requirements live

The five PRD v1.2 sections in [`docs/prd/`](prd/) are the source of truth. Do not invent requirements, dependencies or API contracts that are not in them, and do not use older PRD drafts to override v1.2.

| Section | Read it when you work on |
| --- | --- |
| [1 · Scope, Solutions & Free Stack](prd/01-scope-solutions-stack.md) | What is in or out of scope, the stack, AI models, deadlines |
| [2 · Product Rules & Screens](prd/02-product-rules-screens.md) | Feature behaviour, validation rules, limits, screens |
| [3 · AI Pipeline](prd/03-ai-pipeline.md) | Upload processing, embeddings, topic suggestions, quiz/deck generation, AI call rules |
| [4 · Architecture & Database](prd/04-architecture-database.md) | Folders, request flow, tables, background jobs, security rules, API routes, env vars |
| [5 · Build Workflow & Evidence](prd/05-build-workflow-evidence.md) | Task map, ownership, Git workflow, testing, Definition of Done |

## Plan issues

Every task starts from a **GitHub issue** that holds its high-level implementation plan. Create it with the **Task plan** template ([`.github/ISSUE_TEMPLATE/task-plan.md`](../.github/ISSUE_TEMPLATE/task-plan.md)), titled `T-XX: <task name>`.

- The plan stays high level: goal, PRD references, scope, approach, areas to change, contracts, acceptance criteria, risks. No line-by-line code.
- Whoever implements the task, you or your AI agent, reads the issue and the PRD sections it links to first, then works out the details.
- Creating the issue is enough to start. Arya reviews the plan and the code together at PR time.
- If the implementation has to differ from the plan, say so in the PR.

## Commands

```bash
pnpm install              # install dependencies (pnpm only)
pnpm dev                  # run the app locally
pnpm exec eslint .        # lint
pnpm exec tsc --noEmit    # typecheck
pnpm build                # production build
```

Test and database commands will be added here once their scripts exist.

## Ownership

See the task map in Section 5 for task IDs, owners and prerequisites.

- **Arya**: infrastructure setup, Better Auth (including its generated schema), Study Spaces, frontend screens.
- **Rashid**: domain database tables and later migrations, uploads, extraction, AI/RAG, background jobs, generation, scoring, mastery, revision.
- **Khushi**: threat model, security and ownership tests, prompt-injection and upload/worker security.
- **Chami**: diary, task tracking, datasets, evaluation, guides and submission evidence.

Coordinate before changing anything you don't own, especially shared files: `package.json`, `pnpm-lock.yaml`, `.env.example`, the Drizzle schema and migrations, auth config and route contracts. Changes to `src/server/` or the database schema need a review from Arya or Rashid.

## Git workflow

One task = one branch = one Pull Request.

1. Create (or open) the task's plan issue and check its prerequisites in the Section 5 task map are merged.
2. Branch from the latest `main`:
   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c <type>/T-<ID>-<short-name>   # e.g. feat/T-05-study-spaces
   ```
3. Implement only that task's scope. Don't start a second task with uncommitted work on the first.
4. Run lint, typecheck and build (and tests once configured). Check `git status` and the full diff.
5. Push and open a PR to `main` with: task ID, `Closes #<plan issue>`, PRD sections implemented, what changed, any deviation from the plan, checks actually run, and anything not verified.
6. Squash-merge, delete the branch, smoke-test the Vercel deployment.

`main` is protected: PRs and squash merges only, no direct pushes. No approvals or GitHub Actions CI are required, but ask a teammate to review shared DB, auth or security changes.

## Request flow and folders

From Section 4. Study Spaces is the pattern every feature follows.

1. **Route** (`src/app/…`) validates the request with the feature's Zod schema.
2. **`requireUser()`** returns the signed-in user or responds 401.
3. **Feature service** (`src/features/<feature>/server/`) runs the business rule and checks ownership with `requireSpace(spaceId, user)` (404 if not theirs).
4. **Adapters** (`src/server/`) talk to Postgres (Drizzle), Blob, QStash and Gemini. Features never call these services directly.
5. **Response** is JSON; errors use `{ "error": { "code", "message" } }` with stable codes.

| Path | Contents |
| --- | --- |
| `src/app/` | Pages, layouts, API route handlers |
| `src/features/<feature>/` | `components/`, `server/`, `schemas.ts`, `__tests__/` |
| `src/server/` | `db/`, `auth/`, `ai/`, `jobs/`, `storage/` adapters |
| `src/components/ui/` | shadcn/ui components |
| `drizzle/` | Versioned SQL migrations |
| `tests/` | `unit/`, `integration/`, `e2e/`, `fixtures/` |

A feature may import another feature only through its `server/index.ts`. Create folders only when you need them.

## Rules that are never broken

- Gemini is called only through `callAI()`.
- The database schema changes only through migrations.
- Secrets never appear in code.
- Every space-scoped route calls `requireSpace()`.
- A feature never edits another feature's internal code.

The ten security rules in Section 4 also apply to every change. In particular: identity comes only from the session, scores are calculated on the server, and correct answers are never sent before submission.

## Secrets and data

- Real secrets go only in `.env.local` (git-ignored) and Vercel project settings. `.env.example` holds variable names only.
- Use your own development/test database, never the production one.
- This repository is public. Never commit `.env` files, credentials, private lecture materials, consent forms or any personal information. Commit only permitted, anonymised fixtures and summaries.

## Definition of Done

A task is done only when the PR is merged and the checklist in Section 5 is met: behaviour matches the PRD, ownership is checked and tested, checks were actually run, and anything not verified is listed. Every author must be able to explain all the code they submit.
