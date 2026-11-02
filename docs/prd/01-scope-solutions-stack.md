# Capstone 2 PRD v1.2 — Section 1: Scope, Solutions & Free Stack

Version 1.2 · 2 November 2026 · Owner: Arya

Capstone 2 aims to implement the agreed student Core promises from the Capstone 1 proposal in a demonstrable, affordable prototype. Instructor features and AI short-answer marking stay designed but deferred, which matches both the Capstone 1 proposal and the Project 15 brief, where they are stretch items.

This is Section 1 of the five-part Capstone 2 PRD. The other sections cover product rules and screens (2), the AI pipeline (3), architecture and database (4), and build workflow and evidence (5).

Sources: Capstone 1 proposal (`NIT3003_IT_Capstone_Project_1_Complete.pdf`, §1.5–1.7 and §2), the Capstone 1 presentation, the Project 15 brief, and the VU Collaborate assessment table.

## Promise-by-promise plan

The table below is a **delivery plan**, not a list of completed features. Core remains planned in simplified or full form; instructor and AI-marking capabilities are deferred subject to assessment/lecturer acceptance. Track actual status by completed and tested features; do not count an unimplemented promise as built.

| Promise (Capstone 1) | Capstone 1 tier | Project 15 brief | Plan | What Capstone 2 builds |
| --- | --- | --- | --- | --- |
| FR-01 Register and sign in | Core | Requirement | Build (simplified) | Email and password for students. A `role` field exists, but there is no instructor sign-up. |
| FR-02 Personal Study Spaces | Core | MVP | Build | Create, rename, open and delete your own spaces. |
| FR-03 Upload PDF, PPTX, TXT (10 MB) | Core | MVP | Build | The browser uploads straight to private storage; the server checks the file before processing. |
| FR-04 MCQ generation | Core | MVP | Build | Built from chosen materials and topics, each question tagged to one topic; 5, 10, 15 or 20 questions. |
| FR-04 Short-answer practice questions | Core | Requirement | Build (simplified) | The AI writes the question, a model answer and 2–4 key points. The student answers, reveals the model answer and rates their recall (Again or Got it). Not scored, no AI marking. |
| FR-05 Flashcards | Core | MVP | Build | Up to 20 cards per set; self-rated. |
| FR-06 Source links and explanations | Core | MVP | Build | Every item cites the page or slide it came from. |
| FR-07 Answerability and single-correct-answer check | Core | MVP | Build (simplified) | Code checks (four different options, valid citations) plus one cheap AI check call per batch. |
| FR-08 Quiz attempts | Core | MVP | Build | Scored on the server; answers are hidden until submission. |
| FR-09 Topic mastery | Core | MVP | Build | Latest 10 distinct questions; fewer than 5 shows "insufficient evidence". |
| FR-10 Weak topics | Core | MVP | Build | Below 60% with enough evidence. |
| FR-11 Revision planner | Core | MVP | Build (simplified) | A list of Overdue, Today and the next 7 days instead of a full calendar widget. |
| FR-12 Spaced repetition (1, 3, 7 days) | Core (team choice) | Stretch | Build | Exactly as proposed. |
| FR-13–16 Instructor Course Spaces, joining, topic mapping, class analytics | Advanced | Stretch | Defer | Kept in the design and report as future work; the database leaves room for them. |
| FR-17 AI short-answer feedback and human review | Advanced | Stretch | Defer | Future work; the 30-response comparison is deferred with it. |
| FR-18 AI-generated labels | Core | Requirement | Build | A label on every generated item. |
| FR-19 Report AI content | Core | — | Build (simplified) | Report button with a reason; the student can remove the item from their own practice. |
| Personal topics | Core | Requirement | Build (simplified) | AI suggests topics after each upload; the student can rename, add or archive them. |
| Knowledge-tracing comparison | Advanced | Stretch | Optional | Week 3, if time allows: an offline script comparing an Elo-style model with percentage-correct (about one day). |
| 100 questions reviewed by 2 people | Core | MVP evaluation | Build | As proposed; recruit reviewers in Week 1. |
| 4–6 student usability testers | Core | Baseline | Build | As proposed, with a consent form. |
| 20 simultaneous users | Core | — | Build (simplified) | A load test script with the AI replaced by a fake, so it measures the app and not the free AI quota. |

## Hard promises and the simple way to keep them

Nine Capstone 1 promises are harder than they look; each has a simple solution that still meets the original promise.

| Promise | Why it is hard | Simple solution |
| --- | --- | --- |
| Answerability and unambiguous-answer checks (FR-07) | Proving an AI question is correct is not possible in code. | Code checks shape and citations; a second, cheaper AI call reads the question with its cited text and answers "supported / one correct answer: yes or no". The 100-question human review measures how well this works. |
| 100 questions, 2 subject-knowledgeable reviewers | Needs people with subject knowledge, and time. | Generate from lecture notes of a unit the reviewers have passed. Recruit 2 classmates or a tutor in Week 1. Use a shared Google Sheet with the rubric (correct, clear, difficulty 1–5). |
| Topic mastery tracked per topic | Stable topic identities and evidence from several documents are required. | Extract topics with a token-budget check; analyse in batches when necessary, consolidate source-backed suggestions and let the student confirm, rename or add topics. Mastery then uses each MCQ's topic ID. |
| Argon2id password hashing | Better Auth uses scrypt by default. | Pass a custom hash and verify pair using `@node-rs/argon2`; about 10 lines. |
| Private, securely deleted study files | Blob and PostgreSQL deletion are not one transaction. | Store private objects; authorise every read; mark the material inaccessible immediately; persist a durable cleanup job with the object key **before** removing parent rows and retry failed Blob deletes. |
| Maximum two AI generation jobs at once | QStash parallelism is per endpoint request, not an entire multi-step generation job. | Admit no more than two active quiz/deck jobs in a PostgreSQL atomic transaction; use QStash delivery flow control only as an additional throttle. |
| 20 simultaneous active users | The free AI tier would hit its limits before the app does. | Load test the app with a fake AI provider (same interface, instant canned answers) and report AI limits separately. |
| Prompt-injection safeguards | Uploaded notes are untrusted text. | Wrap source text in clear delimiters, use structured output only, give the AI no tools, and test with a planted "ignore your instructions" file. |
| WCAG 2.1 AA on key screens | Accessibility is easy to break. | shadcn/ui (Radix) components handle keyboard and focus; run the axe browser extension on 6 key screens and fix what it reports. |

## Free tech stack

The stack follows the Capstone 1 architecture using low-cost or free-tier services where available. The exact quotas, feature entitlements and billing conditions must be verified; **zero cost is a constraint to test, not a guaranteed property**. Free-tier availability, data use and limits must be verified in the actual provider accounts before implementation; do not treat free tier as a confidentiality guarantee.

| Layer | Choice | Cost | Why |
| --- | --- | --- | --- |
| App framework | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | Free | One codebase for screens and API; accessible components out of the box. |
| Hosting | Vercel Hobby | Free (personal, non-commercial) | Initial public GitHub repository and boilerplate production deployment exist at [https://ai-study-coach-zeta.vercel.app/](https://ai-study-coach-zeta.vercel.app/). Vercel Hobby is owned by Arya; verify preview and contributor deployment eligibility rather than assuming all team-member PRs deploy. |
| Database and vectors | Neon Postgres with pgvector, added through the Vercel Marketplace | Free plan | Learning data and embeddings in one database, so ownership filters run in the same SQL query. |
| Database code | Drizzle ORM | Free | Type-safe queries and versioned migrations. |
| Login | Better Auth (email and password) | Free library | Sessions and password handling without writing your own. |
| File storage | Vercel Private Blob | Plan-dependent, verify usage | Private store and owner-checked access, with recoverable deletion. Requires supported SDK/private-store configuration; user files are never public by default. |
| Background jobs | Upstash QStash | Plan-dependent, verify usage | Signed callbacks, retries and per-step flow control. Database claims, leases, durable cleanup, idempotency and two-whole-job admission are application responsibilities. |
| AI | Vercel AI SDK with the Google Gemini API free tier | Provider-specific free allowance, subject to current terms | See the next section. |
| Local development and verification | Personal Neon dev/test databases and manual PR checks | Free-tier limits to verify | Use separate development/test connections and run local lint, typecheck, build and relevant tests before each PR; **GitHub Actions CI is not part of this baseline**. |
| Tests | Vitest, Playwright, axe, k6 (load) | Free | Unit, end-to-end, accessibility and load evidence. |

## Free AI models

The proposed provider is Google's Gemini API free tier. Confirm actual model eligibility, credit or billing requirements, quotas and content-handling terms in the project's account before use ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)).

| Job | Model | Notes |
| --- | --- | --- |
| Topic discovery, MCQs, short-answer cards, flashcards | A **pinned stable Gemini Flash model ID** chosen after a real smoke test | Structured JSON using supported AI SDK APIs; split inputs at a verified token budget. Avoid untested moving aliases and unbounded prompts. |
| Answer check (FR-07) | **Gemini Flash-Lite** | Cheaper and faster; it only answers "supported, one correct answer: yes or no". |
| Embeddings for search | **`gemini-embedding-001`**, fixed 768 dimensions | Model supports 768-D output when requested. **Manually L2-normalise truncated 768-D vectors** before storing and querying with cosine distance; use matching model/version and task-type settings for document/query inputs. Never compare vectors from different embedding models. ([Google embeddings](https://ai.google.dev/gemini-api/docs/embeddings)) |

**Rate limits.** Google shows each project's free-tier limits in AI Studio rather than publishing fixed numbers ([Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)); do not rely on community estimates or fixed daily quotas. Measure and document the project's currently enforced model-specific limits; enforce no more than two active generation jobs at the database level and apply a per-student daily cap. QStash delivery and retries alone do not enforce whole-job concurrency.

**Privacy trade-off (covered in the responsible AI report).** The unpaid API terms may allow submitted content to be used for service improvement. Display an upload-time disclosure, obtain informed tester agreement, and use only permitted, non-sensitive or synthetic materials. Do not submit unpublished student records, private lecture notes without permission, or confidential files. Record provider terms checked and the relevant date in the responsible AI report.

**Fallback.** Keep model names in environment variables and call them only through the AI SDK. If Gemini's free limits become a problem, evaluate Vercel AI Gateway or another provider against current pricing, privacy terms, model API and embedding compatibility before changing configuration. Switching embedding models requires model/version metadata and re-embedding all existing chunks; do not assume a drop-in replacement.

**Provider selection:** Gemini is the initial proposed choice, not an unchangeable rule. Alternative providers require verified API, privacy, rate-limit, cost and embedding compatibility before adoption.

## Delivery targets

The 6 November progress report is the first reporting milestone, **not a guarantee** that the complete integrated Core loop will be ready. Attempt the highest-value vertical slice first and report any missing flow honestly. Final delivery remains targeted for 23 November; verify the official assessment notice.

| Date | Target | Assessment |
| --- | --- | --- |
| Mon 2 Nov | Completed: public GitHub repository, Next.js 16 project scaffold, manual lint/typecheck/build, initial Vercel deployment, branch protection. Not yet completed: database, authentication, AI integration, live model smoke test. | — |
| Fri 6 Nov, 23:59 | **Target:** as much of the end-to-end student Core loop as has been implemented, demonstrated with real persisted data (not fake completion). Report Done / Partial / Not started per requirement, blockers and next steps; clarify how the university defines 80%. | Progress report, 10% (confirm rubric) |
| Fri 13 Nov | Flashcards, short-answer practice, content reports, deletion, security tests; generate the 100 review questions | — |
| Fri 20 Nov | Evaluations done (100-question review, usability, load, security); responsible AI report; optional knowledge-tracing script | — |
| Mon 23 Nov, 23:59 | Final delivery | Final project, 70% |
| Week 4 (time TBA) | Oral presentation | 20% |

The assessment table does not define what "80% project completion" is measured against. The team proposes the promise table as the measure and confirms it with the lecturer in Week 1.

## Key decisions

- **Product scope:** scored MCQs; self-rated recall and typed short-answer cards; mandatory topic confirmation; multi-topic quizzes with one topic per MCQ; latest-ten-distinct-question mastery; simple 1/3/7-day revision.
- **Advanced scope:** instructor features (FR-13–16) and AI grading/human-review (FR-17) remain deferred design work; the original Project 15 brief names instructor roles and analytics, so request lecturer confirmation of any assessed-scope reduction.
- **Backend:** Next.js, Better Auth, Neon/Drizzle/pgvector, Private Blob and QStash are *proposed integrations*; only the initial app deployment is completed. Enforce privacy and job concurrency in code/database, not merely provider settings.
- **AI:** select specific available stable model IDs in the actual Google project; structured output and citations require validation; 768-D embedding vectors using `gemini-embedding-001` require manual normalisation; confirm token limits and usable quotas before implementing ingestion.
- **Verification:** 100 MCQs with two subject-knowledgeable reviewers remains an evaluation target; arrange permissions and reviewers early. Development uses local checks and short-lived PR branches, without mandated GitHub Actions CI.
- **Assessment:** university/lecturer instructions outrank the product plan. The 6 November milestone and 80% wording are targets pending authoritative rubric confirmation; do not claim completion without evidence.

## v1.2 implementation status and release constraints

- GitHub: public repository `Aryasuwegatama/ai-study-coach`, `main` protected by PR rules, squash-only merge. No mandatory reviewer approval or GitHub Actions CI has been configured; do not state that automated gates pass.
- Production: the Next.js starter is deployed on Vercel, but none of the application's Core journeys has been implemented yet. A successful boilerplate deployment does **not** establish the AI, database or security readiness of the app.
- Database, Better Auth, Blob, QStash and Gemini are intended components, not yet verified integrations. Check provider terms, quotas and compatible model identifiers before creating migrations or background-job logic.
- The 6 November target is an aspirational integration milestone, not evidence of an achieved percentage. Report implemented versus unimplemented capabilities honestly and verify formal requirements with the lecturer.