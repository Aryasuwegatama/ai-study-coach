# Capstone 2 PRD v1.2 — Section 5: Build Workflow & Evidence

Version 1.2 · 2 November 2026 · Owner: Arya

Arya and Rashid build the critical path, Khushi builds the security tests alongside them, and Chami runs documentation, evaluation and the diary. Every change goes through a short task branch and PR with manual local checks; team review is encouraged but not enforced in the current GitHub ruleset, and every task starts from a GitHub plan issue that points to the relevant parts of these five sections.

The five PRD sections in `docs/prd/` are the source of truth for the project. Change them only through a PR.

## Team roles and ownership

The role split below is the **agreed proposed implementation allocation**, based on the Capstone 1 work areas and the 2 November team planning discussion. It does not mean any pending work is complete. Arya takes full ownership of initial service setup plus frontend and authentication; Rashid starts backend feature development on the prepared foundation. Collaborators still need GitHub onboarding and explicit task acceptance.

| Person | Project role | Owns in Capstone 2 | Coordinates/reviews |
| --- | --- | --- | --- |
| Arya | Project Lead / System & UI Lead | **Initial project-wide setup:** GitHub/Next.js/Vercel, Neon database connection, Drizzle migration tooling, pgvector extension, Blob/QStash/Gemini development configuration, safe env template; **all authentication** (Better Auth server/session, Google-only sign-in, plus the sign-in UI); Study Spaces UI/API; frontend screens, integration, release | Owns infrastructure/shared contract decisions; reviews Rashid's server/backend PRs |
| Rashid | Technical Lead / Backend Features | **After setup:** domain database schema and feature migrations, secure uploads, file extraction/chunks, AI/RAG and embeddings, queue/job logic, quiz/deck generation, server scoring, mastery and revision services | Coordinates schema changes with Arya; implements service contracts consumed by Arya's UI |
| Khushi | Cybersecurity & Management Lead | Threat model, ownership/access-control test cases, upload and worker signature tests, prompt-injection safeguards verification, OWASP ZAP, security/privacy evaluation and risk tracking | Reviews authentication, storage and jobs security where available; executable tests wait for interfaces |
| Chami | Documentation & Planning | Dated diary, requirement/task tracker, datasets/permission records, reviewer recruitment, evaluation rubrics, usability consent, setup/user guides and submission evidence | Reviews docs and tracks dependent milestone evidence |

**Ownership boundary:** Arya configures the initial database/service connections but does **not** build all future backend domain tables. Rashid owns subsequent domain migrations within the agreed schema contract. Arya owns authentication and its generated auth schema. Avoid two developers editing the same Drizzle/auth migration files on different unmerged branches.

**Security and access:** use separate development/test database credentials for collaborators, not the production Neon password or Vercel production secrets. The main-branch ruleset currently requires a PR and squash merge, but **zero approvals**; request human review when possible without treating it as a configured merge gate.

## Plan — rebaselined 2 November 2026

**Verified baseline:** public repository and protected `main`, working Next.js 16 boilerplate, local lint/typecheck/build, initial Vercel production deploy. **Not built:** authentication, Neon database, AI adapter, private storage, QStash processing, student product screens, quiz/mastery/revision and evaluation.

**Scope strategy:** complete the smallest genuine end-to-end student Core journey before extras. The Friday 6 November progress report is a high-risk integration target, **not** proof that 80% has been completed. Report each feature as Done / Partial / Not started based on real tests.

| Window | Highest-priority deliverables | Evidence |
| --- | --- | --- |
| 2–3 Nov | Final PRD docs and repo instructions; verify Gemini model/API, 768-D embedding and quota; create dev Neon connection; generate Better Auth schema and DB migration | Documented working foundation and first ownership-protected sign-in/Study Space slice, or clear blockers |
| 3–5 Nov | Private Blob upload and signatures; extract and chunk PDF/PPTX/TXT; durable worker claims; embeddings and source-backed topic draft; UI for upload and topic confirmation | Show genuine persisted material processing instead of simulated completed states |
| 5–6 Nov | If processing is functional, integrate the first five cited MCQs and server scoring; prepare progress report and dated diary | Demo only tested functionality; explain what remains incomplete |
| 9–13 Nov | Complete quiz generation, autosave/results, server scoring, mastery, simple 1/3/7 revision, and standard/typed flashcards | Working student journey, integration/security tests |
| 16–20 Nov | Reporting/deletion/notifications, accessibility, ZAP and load checks; independent human evaluation of 100 MCQs and 50 cards; usability and responsible-AI report | Evaluation data and limitations rather than claimed accuracy |
| 23 Nov | Final submission and oral-presentation preparation (confirm official unit notice) | Tag actual tested delivery and provide backup demo |

**Dependencies:** Better Auth and the ownership model must exist before protected Study Space APIs; database migrations before data features; upload and extraction before embeddings/topics; confirmed topics and grounded sources before quizzes; scored quizzes before mastery and revision. Build UI in parallel only against agreed API/Zod schemas.

**Assessment:** formal university deadlines, marking requirements and the phrase "80% complete" must be checked against the lecturer/rubric. The promise table is a useful tracking tool, **not automatically the university's official percentage formula**.

**Team:** Arya can build the initial foundation; collaborator invitations and task assignments are pending until confirmed. Chami tracks diary/reviewer recruitment and Khushi can begin security test cases once contracts exist. Use approved non-sensitive source documents only.

## Git and repository workflow

**Actual GitHub state:** public repository [ai-study-coach](https://github.com/Aryasuwegatama/ai-study-coach); protected `main`, PR required, squash-only merges, no force pushes/deletions. **Required approvals: 0. GitHub Actions CI: not configured.** Do not require either as an acceptance condition.

Use GitHub Flow: for each task create a new short-lived branch off current `main` (for example `feat/T-05-study-spaces`), commit one coherent change, validate it locally, open a PR, inspect diff and secrets, squash-merge, delete branch, and smoke-test the latest Vercel deployment. Keep `main` deployable and do not push to it directly.

- **Local checks:** `pnpm exec eslint .`, `pnpm exec tsc --noEmit`, and `pnpm build`. Run `pnpm test` only after setting up the test script, and record real outcomes/known gaps in each PR.
- **Review:** seek a teammate's review for shared DB/auth/security changes when available. This is a team convention, **not a current branch protection requirement**.
- **Secrets/data:** `.env.local` and Vercel env hold secrets, never the public repo. Keep raw documents, consent, identifiable reviewer results and private lecture files in protected storage; commit only permitted anonymised test fixtures and summaries.
- **Environments:** local dev/test Neon databases when configured; Vercel preview when contributor permissions and webhook callbacks are actually verified; Vercel production from `main`. **Production and Preview are connected** (confirmed 5 Nov): Production uses the Neon `main` branch, and each Preview deployment gets its own Neon branch copied from `main` (Neon preview branching). Don't claim automatic previews work for every collaborator without testing. **Migrations run automatically during the Vercel build** (`vercel-build` script: `drizzle-kit migrate && next build`, added T-01b), against whichever branch that deployment's `DATABASE_URL_UNPOOLED` points at — Production's `main` or a preview's own branch. A failed migration fails the build. Local `pnpm build` never migrates anything.
- **Migrations:** use versioned Drizzle migrations; start with Better Auth and Study Spaces, then add schema by feature while maintaining the intended 17-domain-table design and all cross-space/quiz-membership integrity constraints. Inspect the auth adapter's real ID type before creating domain FKs.
- **Contracts:** an API/schema PR can precede parallel UI and backend tasks. Review generated AI code line by line. Do not allow coding agents to modify multiple unrelated features or add mandatory CI without approval.
- **Release tags:** use `v0.1-progress` and `v1.0-final` only when the corresponding actual assessment submission occurs, noting which functionality was verified.

### Parallel development: ownership, contracts and dependency gates

**Rule:** Everyone can work on independent tasks from separate branches of the latest merged `main`. Frontend views may use fixtures while the backend is under development. **Integrated** means real authentication, persistence and tested API responses—not just a screen with demo data. A dependency that is not ready must be recorded as a blocker rather than ignored.

#### Team starting plan — Tuesday 3 November 2026

| Contributor | Safe starting work | Branch suggestion | Dependency / merge gate |
| --- | --- | --- | --- |
| **Arya — setup, authentication and frontend** | Finish initial service connections (Neon/Drizzle/pgvector, Blob/QStash/Gemini development setup), implement Better Auth server/session, switch to Google-only sign-in, then the styled sign-in UI and dashboard shell on separate branches | `chore/T-01a-infrastructure`, `feat/T-01b-auth-backend`, `feat/T-01c-google-auth`, `feat/T-04a-auth-ui`, `feat/T-04b-dashboard-ui` | T-01b needs the working T-01a DB/auth migration configuration; T-01c needs T-01b merged. Dashboard may use fixtures until Study Spaces T-05. |
| **Rashid — backend features** | While Arya sets up services, draft extraction/chunking acceptance cases, AI prompts/schemas and upload API contract without editing owned foundation files. Once development credentials work, run the AI smoke test and implement backend features in dependency order. | `spike/T-02-ai-smoke`, then `feat/T-06a-upload-contract` | T-02 can prepare fixtures immediately but live provider calls need the safe Gemini dev configuration from T-01a. Upload implementation T-06b requires auth/Study Space services and private Blob setup. |
| **Khushi — cybersecurity** | Threat model, ownership/auth negative-test plan, upload/injection test fixtures with synthetic text, risk register | `test/T-07a-security-plan` | Planning independent. Executable auth tests need T-01b/T-05; upload/job tests need T-06b/T-08a. |
| **Chami — documentation/evaluation** | Daily diary, requirement-to-task/dependency tracker, evaluation rubric, permitted datasets, reviewer recruitment and consent plan | `docs/T-17-evidence` (after documentation ownership agreed) | Can start independently; real screenshots, results and user guide require merged working features. Avoid concurrent edits to the same PRD files as Arya's T-03. |

#### Contracts to agree before work branches diverge

- **Arya owns Better Auth:** Google sign-in configuration, error handling, session retrieval, protected route behaviour, redirect path and shared `requireUser()` / `requireSpace()` helpers. Rashid imports these contracts; he should not create a second auth system.
- **Rashid owns domain database migrations:** after Arya establishes Neon/Drizzle/pgvector and auth schema, Rashid owns new material/chunk/set/attempt/revision tables as required by server features. Arya owns the initial Study Space table/API (T-05); align composite FKs before Rashid adds related tables.
- **Upload and processing contracts:** agree material status enums, source IDs/page markers, owner checks, file limits, retry semantics and API response/error shapes before Arya wires materials screens.
- **Provider setup vs implementation:** Arya adds safe service clients/configuration and secrets in private development settings, documenting variable names in Section 4's Environment variables table; Rashid implements the actual processing handlers, retrieval and AI jobs. No production credential sharing.
- **Shared files:** agree one owner for `package.json`, lockfile, Drizzle schema/migrations, auth config and route contracts per PR. Coordinate changes that touch the same file and merge foundation changes first.

#### Independent vs blocked tasks

| Category | Can begin immediately | Must wait before integration |
| --- | --- | --- |
| Independent | Initial service setup, design system, dashboard shell, extraction/AI spike design, security test plan, evaluation docs | No dependency for starting; each owner must branch separately |
| Contract-dependent | Rashid's upload/AI schema drafts; Arya's materials/quiz UI with fixtures | Merge agreed API/Zod schemas before connecting UI to server routes |
| Implementation-dependent | — | Google-only sign-in (T-01c) waits T-01b; the styled sign-in UI (T-04a) waits T-01c; Study Space CRUD waits T-01b; real upload waits T-01a, T-01b, T-05 and T-06a; extraction waits T-06b; embeddings/topics wait T-08a + T-02; quizzes wait T-08b; scoring/mastery/revision wait generated items |

#### Practical parallel-branch example

1. Arya creates `chore/T-01a-infrastructure` and configures development Neon, Drizzle, pgvector, Blob/QStash/Gemini clients and environment templates. Rashid independently starts `spike/T-02-ai-smoke` with test schemas/fixtures, **without changing Arya's shared config or using production secrets**.
2. Arya's foundation PR is tested and squash-merged into `main`. Rashid updates his still-open branch against the latest `main` before making provider-backed calls. He completes the smoke test and opens his PR.
3. Arya branches `feat/T-01b-auth-backend` from latest `main`, adds Better Auth registration/login/sessions and generated auth migrations. Rashid may prepare `feat/T-06a-upload-contract` concurrently if the shared authentication/material DTO expectations are agreed.
4. Once T-01b merges, Arya switches to Google-only sign-in on `feat/T-01c-google-auth`, then builds the styled sign-in UI on `feat/T-04a-auth-ui` (T-01c merged). After T-05 Study Spaces is verified, Rashid builds the actual upload backend T-06b. Arya connects materials UI when its API contracts and then implementation are ready.
5. Each independent task gets its **own branch + PR**; an integrated frontend feature may require a **separate follow-up branch** after backend and UI PRs merge. No one should create new task branches from another teammate's unmerged work by default.

**Tracking:** record `Task ID | Owner | Plan issue | Branch | Depends on | Can start? | Blocker | PR URL | Status`. Suggested statuses: Not started, In progress, Blocked, In review, Done. **Done** requires merged PR plus the relevant verified outcome, not merely a convincing mockup.

### Step-by-step task workflow for every collaborator

Every assigned task gets a **unique Task ID → branch → PR**. All collaborators with Write access can create branches from the current `main`. The ruleset protects `main`, not ordinary feature branches. Check the task map below for the exact proposed branch name and prerequisite.

1. **Check dependencies and file ownership.** Verify the prerequisite PR is already merged, or confirm that your task is explicitly independent (e.g. an AI smoke-test plan). Coordinate shared migration/configuration files with Arya before coding.
2. **Update `main` and create the task branch.** Example: Rashid beginning his assigned T-02 AI smoke-test task (provider setup T-01a must be merged before the live API portion):

```bash
git switch main
git pull --ff-only origin main
git switch -c spike/T-02-ai-smoke
git branch --show-current
```

1. **Implement only the assigned scope.** Use the shared auth/DB/storage/AI adapters where configured. For future domain database tasks such as `feat/T-06b-upload-flow`, add versioned Drizzle migrations on the feature branch, test them on a separate development database and never change the initial auth schema without coordinating with Arya.
2. **Run checks and inspect changes.**

```bash
pnpm exec eslint .
pnpm exec tsc --noEmit
pnpm build
git status
```

Run unit/integration/migration checks when their scripts are configured. Review the staged diff: no `.env.local`, database passwords, participant data or private lecture materials may enter this public repository.
5. **Commit and push the same task branch.** Example for Rashid's T-02 spike:

```bash
git add .
git commit -m "test: verify Gemini generation and embeddings"
git push -u origin spike/T-02-ai-smoke
```

`git add .` is safe **only after** checking `git status` and the actual diff for secrets/unrelated files; prefer `git add <specific-paths>` when in doubt.
6. **Open the Pull Request** in GitHub: **base = `main`**, **compare = `spike/T-02-ai-smoke`**. Include Task ID, the plan issue (`Closes #<issue>`), PRD rule/section, what changed, actual tests run, known limitations and dependency/contract changes. Request Arya or the designated teammate to review where available. Current ruleset does not require approvals.
7. **Fix on the same branch.** Push corrections to update the open PR. If `main` changed, update your feature branch against the latest `main` and resolve any conflicts there. Do not force-push shared history without coordination.
8. **Squash-merge the ready PR** into `main`; inspect the Vercel deployment and smoke-test applicable runtime changes. A docs/test-only PR need not show a new UI feature; record its checks and results. Update the task status and remove the remote branch when appropriate.
9. **Start the next task from updated `main`** using a **different task's branch name**. Never reuse a previous task's branch or push directly to `main`.

**Blocked tasks:** If your next task requires an unmerged auth, Study Space, upload or AI contract, you may draft fixtures/tests on a separately scoped preparatory branch, but **do not claim full integration or open a production-ready PR** before the dependency and real tests are complete. Prefer fresh branches after prerequisite merges rather than stacked branches.

**Definition of Done:** one coherent implementation, required dependencies merged, manual checks and available tests verified, secret-safe PR, squash merge, and relevant integration/evidence updated. No GitHub Actions CI is required.

### Task map — planned ownership, branch names and dependencies

**Branch naming convention:** `<type>/T-<ID>-<short-feature>`. Each listed task is a separate branch/PR, including sub-tasks with letters. The **Prerequisite** column determines when a task can be integrated. A draft contract/test plan may start sooner if it does not touch dependent implementation files. `Pending` means **not yet built**.

| Task | Deliverable | Owner | Suggested branch | Prerequisite / start gate | Status |
| --- | --- | --- | --- | --- | --- |
| T-00 | Existing Next.js boilerplate, public GitHub repository, protected `main`, Vercel starter | **Arya** | Already on `main` (historical) | — | **Done 2 Nov** |
| T-01a | Initial **infrastructure setup**: development Neon/Drizzle/pgvector, safe test DB, Blob/QStash/Gemini configuration, Vercel env and reusable service adapters; connections tested, **not** full pipelines | **Arya** | `chore/T-01a-infrastructure` | T-00 | Pending |
| T-01b | **Complete backend authentication**: Better Auth server config, generated auth tables/migration, registration, login, logout, sessions, shared `requireUser()` helper | **Arya** | `feat/T-01b-auth-backend` | T-01a merged | **Done 6 Nov** (#6) |
| T-01c | **Google-only sign-in**: replace email/password with Google OAuth (decision 2026-11-06); oauth-proxy for Preview deployments; encrypted OAuth tokens; bare sign-in page; public privacy policy page | **Arya** | `feat/T-01c-google-auth` | T-01b merged | **Done 7 Nov** (#9) |
| T-02 | Gemini structured-generation/embedding smoke test, 768-D vector normalisation and actual rate limits | **Rashid** | `spike/T-02-ai-smoke` | Fixtures can start T-00; live provider test needs T-01a's safe dev configuration | Pending |
| T-03 | Import the five v1.2 PRD sections into `docs/prd/`; minimal contributor instructions; collaborator onboarding | **Arya** (Chami docs support) | `docs/T-03-project-prds` | T-00; merge early | Pending |
| T-04a | Styled sign-in screen (Google-only, replacing the bare T-01c page), loading/error states | **Arya** | `feat/T-04a-auth-ui` | T-01c merged | **Done 7 Nov** (#11) |
| T-04b | Shared app shell, sidebar and **dashboard UI** with labelled sample data; protected-route redirects (moved from T-05) | **Arya** | `feat/T-04b-dashboard-ui` | T-00; real content waits for T-05 | Pending |
| T-04c | **Merged into T-04a** — Google sign-in has no separate form to integrate; T-04b now covers protected-route redirects and session UI directly. | — | — | — | Merged into T-04a |
| T-05 | **Full-stack Study Spaces**: owned CRUD API, initial Study Space schema/migration, UI and auth-checked access; first-sign-in redirect to Create Study Space | **Arya** | `feat/T-05-study-spaces` | T-01b and T-04b merged; coordinate schema boundaries with Rashid | Blocked by prerequisites |
| T-06a | Upload/API contract: Zod request/response/status/error shapes and ownership checks | **Rashid** | `feat/T-06a-upload-contract` | Can draft after shared auth/Study Space contract; merge after T-01b/T-05 contracts agreed | Pending |
| T-06b | Private Blob upload, material/domain migration, server-side validation and owner-only file reads | **Rashid** | `feat/T-06b-upload-flow` | T-01a, T-01b, T-05 and T-06a merged | Blocked by prerequisites |
| T-07a | Threat model, auth/ownership security test plan, negative-test fixtures and risk register | **Khushi** | `test/T-07a-security-plan` | T-00; can start independently | Pending |
| T-07b | Executable auth/session and cross-space ownership tests | **Khushi** | `test/T-07b-auth-ownership` | T-01b and T-05 merged plus isolated test DB | Blocked by prerequisites |
| T-08a | Material processing: QStash worker claims, PDF/PPTX/TXT extraction, chunk records, resumable steps | **Rashid** | `feat/T-08a-extract-chunk` | T-06b + T-01a merged | Blocked by prerequisites |
| T-08b | pgvector embeddings, RAG groundwork, AI topic suggestions and confirmation-backed data persistence | **Rashid** | `feat/T-08b-embed-topics` | T-08a and T-02 completed | Blocked by prerequisites |
| T-09 | Materials screens, statuses and topic-confirmation UI | **Arya** | `feat/T-09-materials-ui` | UI draft after T-06a contract; real integration after T-06b/T-08b | Blocked for integration |
| T-10 | Upload, signed-worker, retry/idempotency and cross-space source tests | **Khushi** | `test/T-10-materials-jobs` | T-06b/T-08a implementation | Blocked by prerequisites |
| T-11a | Quiz generation API contract, schema and source/topic membership rules | **Rashid** | `feat/T-11a-quiz-contract` | T-02 and accepted extraction/topic contract; can draft before T-08b completes | Pending |
| T-11b | RAG-grounded quiz generation, AI checks, source citations and atomic publication | **Rashid** | `feat/T-11b-quiz-generation` | T-11a and T-08b merged | Blocked by prerequisites |
| T-12 | Quiz Library, quiz setup, autosaved attempt and results **frontend** | **Arya** | `feat/T-12-quiz-ui` | UI draft after T-11a; real integration requires T-11b + T-14 | Blocked for integration |
| T-13 | Answer-key leak, prompt-injection, source membership and forged IDs tests | **Khushi** | `test/T-13-answers-injection` | T-11b implemented | Blocked by prerequisites |
| T-14 | Quiz attempts and server scoring; topic mastery query; revision business logic and migrations | **Rashid** | `feat/T-14-scoring-mastery-revision` | T-11b merged; agree APIs before T-12/T-15 integrations | Blocked by prerequisites |
| T-15 | Progress, weak topics and revision session **frontend** | **Arya** | `feat/T-15-progress-revision-ui` | UI draft after T-14 contract; real integration after T-14 merge | Blocked for integration |
| T-16 | Forged-score, quiz-item membership, duplicate-submit and revision-schedule tests | **Khushi** | `test/T-16-scoring` | T-14 implementation | Blocked by prerequisites |
| T-17 | Diary and progress evidence; permitted datasets; human review rubric and tester recruitment | **Chami** | `docs/T-17-evidence` | Preparation can start T-00; repo evidence merge coordinates with T-03 docs layout | Pending |
| T-18–T-26 | Future cards, reports, notifications, deletion, usability, security/evaluation and load tasks | To assign individually | **Create one branch per task when scoped**; do not use a combined `T-18–T-26` branch | Core flows and acceptance tests determine individual dependencies | Not yet scoped |

**Schema ownership rule:** Arya maintains initial infra, Better Auth/auth migrations and the Study Space API/schema. Rashid owns later domain migrations (materials/chunks/sets/attempts/revision) and must coordinate composite foreign keys with Arya. This does not remove Rashid's server-side responsibilities from the original Capstone 1 proposal; it **separates initial setup from backend product features**.

**Parallelism rule:** T-01a, T-03, T-04b (as Arya's capacity permits), T-02 preparation, T-07a and T-17 preparations may progress concurrently. T-04a now waits for T-01c (Google-only sign-in) to merge. **Order change (Arya, 2026-11-08): T-04b now comes before T-05** — the dashboard shell (with its protected-route redirects) is built first, and T-05 slots real Study Spaces into that shell afterwards, rather than T-05 building its own redirects. Nobody should wait idly for the full database/AI pipeline when independent frontend, docs or security work is available. Do not start a second task branch with uncommitted work left on the first.

## Working on a task

Every piece of work follows the same steps and is guided by two kinds of document: one contributor guide for the whole project in the repo, and one GitHub plan issue per task. Both are written as complete, self-contained instructions, so anyone (or their AI coding agent) can pick up a task without extra explanation.

**Contributor guide (`docs/CONTRIBUTING.md`).** One short guide (about 100 lines) for working in this repository. It covers:

- the existing commands (`pnpm dev`, `pnpm exec eslint .`, `pnpm exec tsc --noEmit`, `pnpm build`); add test/DB commands once their scripts exist;
- the request flow and folder rules from Section 4, with the Study Spaces feature as the pattern every feature follows;
- the rules that are never broken:
    - Gemini is called only through `callAI()`.
    - The database schema changes only through migrations.
    - Secrets never appear in code.
    - Every space-scoped route calls `requireSpace()`.
    - A feature never edits another feature's internal code.
- where the requirements live: `docs/prd/`.

Personal editor and tool settings stay on each person's machine and are not committed.

**Plan issues** (one GitHub issue per task, titled `T-14: Quiz submission, scoring, mastery and revision rules`, created from the **Task plan** issue template in `.github/ISSUE_TEMPLATE/task-plan.md`). The issue is the high-level implementation plan: goal, PRD references, scope, approach, areas to change, contracts, acceptance criteria and risks. It describes the shape of the work, not line-by-line code, so the implementer (or their AI agent) works out the details against the PRD. Creating the issue is enough to start; there is no separate plan-approval step, and the plan is reviewed together with the PR. Example of the level of detail:

```markdown
## T-14: Quiz submission, scoring, mastery and revision rules
Owner: Rashid · Branch: feat/T-14-scoring-mastery-revision · Depends on: T-11b
PRD: §2 Quizzes, Mastery, Revision; §4 attempts, attempt_items,
  revision_items; security rules 4–5
Approach: autosave and submit endpoints; server-side scoring in one
  transaction; mastery as a query; revision scheduling with request keys
Must not change: auth, other features, migrations (ask the reviewer first)
Contract: POST /api/attempts/:id/submit (Zod schema in schemas.ts)
Acceptance: 7 of 10 correct = 70%; forged score ignored;
  double submit = one result; another student's attempt = 404;
  4 questions = insufficient evidence; wrong answer creates a review due tomorrow
```

**Steps for every task**

1. Create the plan issue from the template (or open the existing one) and read the PRD sections it links to. Agree contract changes with teammates when possible; Arya may proceed alone on initial foundation tasks.
2. For rules with numbers (scoring, mastery, revision dates, limits), write the tests first, then the code.
3. Keep one task per branch, and start the next task on a new branch from `main`.
4. Before opening the PR, run `pnpm exec eslint .`, `pnpm exec tsc --noEmit` and `pnpm build`; also run tests once their scripts are implemented. Read every changed line: each author must be able to explain all the code they submit, in review and in the presentation.
5. In the PR, link the plan issue with `Closes #<issue>`, note any deviation from the plan, and list anything that was not verified. Arya reviews the PR.

## Testing and Definition of Done

Tests are written with each feature, not saved for the end; four kinds of tests cover the Baseline Expectations' unit, integration and end-to-end requirements.

| Kind | Tool | What it proves | Examples |
| --- | --- | --- | --- |
| Unit | Vitest | Rules with numbers work at their boundaries | 4 questions = insufficient; 5 with 2 correct = 40%, weak; revision 1 → 3 → 7, reset to 1; chunk packing; daily limit |
| Integration | Vitest + test database + fake AI | Routes, database and jobs work together, and ownership holds | Student B gets 404 on Student A's quiz; double submit = one result; duplicate job step does nothing; deleted material leaves search |
| End-to-end | Playwright | The student journey works in a browser | Sign up → space → upload fixture → confirm topics → quiz → submit → progress → revision |
| Accessibility and load | axe, k6 | WCAG checks on 6 key screens; 20 simultaneous users with fake AI | Reports saved under `docs/evaluation/results/` |

**Definition of Done** (a task counts as done only when all of these are true):

- [ ]  Behaviour matches the PRD's rules, including errors and empty states
- [ ]  Ownership is checked and has a test
- [ ]  Relevant unit or integration tests are added when feasible; existing tests run successfully, and local lint/typecheck/build results are recorded
- [ ]  Works locally and on a Vercel preview when one is available; production rollout is smoke-tested after merge
- [ ]  Keyboard usable and readable at phone width (for UI tasks)
- [ ]  The PR diff is checked by its author (and teammates when available), squash-merged, and lists what was not verified

## Assessment evidence

Each submission is assembled from things the workflow already produces, so evidence is collected as you go, not written at the end. Check the detailed marking rubrics on VU Collaborate when they are released and add anything missing here.

| Submission | Weight and due | Evidence to hand in | Owner |
| --- | --- | --- | --- |
| Progress report | 10%, Fri 6 Nov 23:59 | Diary (dated entries per member); promise table from Section 1 with Done, Partial or Not started per row as the "80%" measure; live demo of the Core loop or the backup video; link to the repo and preview | Chami (Arya reviews) |
| Final project | 70%, Mon 23 Nov 23:59 | Deployed app and repo; the 5 PRD sections in `docs/prd/`; setup guide (another member reproduces it); user guide; test results and coverage summary; AI evaluation report (100 MCQs, answer check, topics, cards, speed); usability results; security test results and ZAP report; load test report; responsible AI report; known limitations and deviations from Capstone 1 (MCQ-only quizzes, short answer as cards, deferred instructor features) | Everyone; Chami assembles |
| Oral presentation | 20%, Week 4 (time TBA) | Slides: problem, solution, architecture, AI pipeline, evaluation results, security, limitations, team roles. Live demo plus the backup video. Each member presents their own part and can explain their code. | Arya leads |

**Evidence habits:** screenshot or record each feature when its PR merges; save every evaluation and test report under `docs/evaluation/results/` with its date; keep the diary updated daily (5 minutes each).

## Where documents live

Text that changes with the code lives in the repo; personal data, other people's files and large binaries live in a private team drive, linked from the README. Chami owns the structure and consistency of both. Each owner writes the first draft for their own area (Rashid: AI pipeline and database notes; Khushi: security results; Arya: architecture and setup), and Chami edits them into one consistent set.

| In the repo (`docs/`, Markdown, through `docs/…` PRs) | In the team drive (private, linked from the README) |
| --- | --- |
| The 5 PRD sections (`docs/prd/`) | Signed consent forms |
| README and setup guide; user guide | Reviewer names alongside their ratings; the raw rating sheets |
| Plan issues (GitHub Issues, not files) | Usability session recordings and tester details |
| `DATASETS.md` and the evaluation rubric | Lecture files that may not be redistributed |
| Anonymised evaluation and test summaries ("Tester 3 completed 6 of 6 tasks") | Demo videos and presentation slides |
| Responsible AI report draft | Final report as Word or PDF while it is being co-edited (the submitted PDF can be committed at the end) |
| Diary as dated entries (`docs/diary/`) |  |

**Rule:** no personal information is ever committed. If a document needs it, the repo holds an anonymised summary and a link to the drive copy.

## Risks

Khushi owns this list, checks it at each stand-up and adds new risks as they appear.

| Risk | Effect | What we do |
| --- | --- | --- |
| Gemini free-tier limits change or are lower than expected | Generation slows or fails with 429 errors | Record the project's real limits in the initial model smoke test; keep jobs to 2 at once; evaluate current alternatives for quota, cost, model compatibility and data-handling terms before switching |
| QStash free daily message cap is reached | Upload and generation steps stop until the next day | Check the cap before enabling uploads; keep embedding to steps of 50 chunks; use small sample files while testing |
| Neon free compute/branch allowances are limited and may change | Databases suspend or run out of hours late in the month | Delete unused branches; let branches scale to zero; use a dedicated local integration-test database |
| Vercel preview protection blocks QStash | Uploads stall on PR previews | Use verified deployment protection bypass only where necessary and test callback delivery before relying on PR previews |
| A reviewer is unavailable | PRs wait and branches go stale | Use a backup reviewer when available; the ruleset currently requires zero approvals, so record author-side review when none is available |
| Week 1 slips | The 80% demonstration is at risk | Build the Core loop first; cut Advanced items before Core ones; record the backup demo video by Thursday |

## Key decisions — v1.2

- Public GitHub repository, protected main, PR and squash merging, **0 required approvals**, no mandatory CI; manual local lint/typecheck/build and available tests before merging.
- Tasks use short-lived branches and small, documented change sets. T-00 is complete; all authentication, database, AI and application tasks are still pending.
- Three intended environments are local dev/test, Vercel PR previews (only if verified) and Vercel production. Separate Neon development/production connections are **planned**, not yet working.
- Foundation-first order: auth and real SQL IDs → ownership-secured Study Spaces → private material upload → extraction/embedding → confirmed topics → cited quiz → scored attempts → mastery/revision → flashcards and evaluation.
- Team assignments and reviews are conventions to confirm at onboarding; don't confuse them with enforced GitHub approvals.
- Keep PRD Markdown, contributor guide and anonymised evidence in the public repository; sensitive source materials and participant data remain private.
- Collect actual performance, security, accessibility and 100-MCQ human-review results; avoid invented test coverage or completion percentages.

## Implementation status and pending external checks (2 November 2026)

**Completed:** Next.js 16 scaffold, local ESLint/TypeScript/build checks, Vercel starter deployment, public GitHub repository and protected main PR ruleset.

**Pending:** commit v1.2 docs, auth and Neon, Blob, Gemini, QStash, features and security/evaluation evidence. The 6 November 80% progress requirement needs an authoritative interpretation from the unit; missing deliverables must be honestly stated. Confirm that instructor-related scope deferrals satisfy the lecturer's assessment expectations.

**Provider verification:** inspect real free-tier quotas, Vercel teammate preview eligibility, and QStash callback access in the configured accounts. Nothing in this document establishes paid-service entitlement or completed integration.