# Security test plan — T-07a

Owner: Khushi. Drafted 20 November 2026 against `main` at `0f886f4`.
Task: [#19](https://github.com/Aryasuwegatama/ai-study-coach/issues/19).
Review required: Arya for auth/Study Spaces; Rashid for uploads, workers, AI and scoring.

## Purpose and test conditions

This catalogue defines expected behaviour, not passing test results. No live security tests or ZAP scans were performed for T-07a. The PRD sources are [Section 2](../../prd/02-product-rules-screens.md), [Section 3](../../prd/03-ai-pipeline.md), [Section 4](../../prd/04-architecture-database.md) and [Section 5](../../prd/05-build-workflow-evidence.md). Existing `scripts/check-*.ts` provide examples, not evidence that this catalogue has passed locally.

Use synthetic Student A and Student B, each with a real session and separate Study Spaces. A owns a material, confirmed topic, quiz, learning item, attempt and due revision item. B has equivalent valid data. Also give A a second space to test same-owner cross-space mixing. Use only an isolated test database and private test storage. Never use Production, real student files or real session cookies in committed fixtures. T-07b provides the reusable Vitest/database/session setup; T-10, T-13 and T-16 add their own fixtures and fakes.

For resource-denial cases, send otherwise valid requests so validation errors cannot mask ownership. First confirm A can perform the operation, then request A's resource as B and compare status and the entire error JSON with a validly shaped nonexistent ID. Check the database, Blob, queued jobs and response for unintended changes or data. Repeat for malformed IDs, deleted resources and children of a deleted space. A 404 has the stable `{ error: { code, message } }` shape; each resource uses its own not-found code. Do not compare different resource types' messages.

`Executable now` means the target code exists and the named task can implement/run the case once test configuration is available. It does **not** mean an automated test has been merged or passed. `Planned` names an absent feature or a missing recovery path. P0 = release-blocking access/integrity boundary; P1 = important security/reliability coverage; P2 = supplementary assurance. Task names in the tables assign implementation responsibility; Khushi owns this catalogue.

## Catalogue

The SEC-AUTH-01–06 and SEC-SPACE-01–05 IDs retain the names used in the local T-07b draft, so those tests can be reconciled without renumbering. Once reviewed, keep IDs stable; append new IDs and record changes rather than reusing an old ID for another behaviour.

| ID | PRD security rule | Steps and expected result | Tool | Priority | Executable task / availability |
| --- | --- | --- | --- | --- | --- |
| SEC-AUTH-01 | 1, 2 | Create two real sessions without Google using `buildTestAuth()`. Call `requireUser()` with each cookie: resolves that student's ID and `student` role. | Vitest integration | P0 | T-07b; executable now |
| SEC-AUTH-02 | 2, 9 | For every implemented student API method below, use no cookie, a forged cookie, an expired real session and a signed-out session. Each returns 401 `UNAUTHORIZED`, no private data or side effects. Warm the session before sign-out to exercise revocation. | Vitest integration | P0 | T-07b; executable now; extend as routes land |
| SEC-AUTH-03 | 9 | POST synthetic credentials to `/api/auth/sign-up/email` and `/api/auth/sign-in/email`: refused; no password/account created. Expected current codes: `EMAIL_PASSWORD_SIGN_UP_DISABLED` and `EMAIL_PASSWORD_DISABLED`. | Vitest integration | P0 | T-07b; executable now |
| SEC-AUTH-04 | 1 | POST `role: admin` and B's `userId` to A's auth update; role cannot change, session stays A. Current Better Auth rejects role with 400 `FIELD_NOT_ALLOWED`; a safe rejection is acceptable rather than literal silent ignoring. Independently send only B's `userId` with an allowed profile change: identity must stay A. | Vitest integration | P0 | T-07b; executable now |
| SEC-AUTH-05 | 9 | Inspect session cookie attributes from test login: HttpOnly and SameSite=Lax or Strict. Do not claim Secure verification on HTTP localhost. | Vitest integration | P0 | T-07b; executable now |
| SEC-AUTH-06 | 2 | Compare the authentication route registry with all checked-in student route modules and enumerate each exported HTTP method. Fail coverage if a new module/method is omitted; exclude only public auth and separately authenticated worker/cron routes. | Vitest integration | P1 | T-07b; executable now |
| SEC-AUTH-07 | 9 | Build Google social sign-in URL: state and S256 PKCE present. Repeated `/sign-in/social` requests from one synthetic IP reach 429; another IP isn't blocked by that bucket. Never log the state, cookies or tokens. | Vitest integration | P1 | T-07b; executable now |
| SEC-AUTH-08 | 9 | With a synthetic OAuth account, confirm stored token fields differ from the plaintext sentinel and decrypt through the configured auth mechanism. Confirm no password value exists. Perform a consented real Google login separately. | Integration + manual | P1 | T-07b; executable now with isolated OAuth fixture/configuration |
| SEC-SPACE-01 | 2 | List spaces as A and B: each sees only their own; A's name/ID never appears for B. A foreign ID in an irrelevant query must not broaden a collection list. | Vitest integration | P0 | T-07b; executable now |
| SEC-SPACE-02 | 2 | B renames/deletes A's space: identical 404 to nonexistent space; compare full row before/after and confirm no child changes. | Vitest integration | P0 | T-07b; executable now |
| SEC-SPACE-03 | 2 | PATCH, DELETE and `requireSpace()` with missing UUID, malformed, empty handler parameter, deleted and foreign IDs: identical 404 body. Empty URL segment itself routes to the collection, so test the empty parameter directly. | Vitest integration | P0 | T-07b; executable now |
| SEC-SPACE-04 | 1, 2 | A creates/renames with B's `ownerId`, B's `userId` and `role: admin`: ownership remains A, no privilege change; response contains only public space fields. B's list stays private. | Vitest integration | P0 | T-07b; executable now |
| SEC-SPACE-05 | 2 | A renames then deletes own space: 204, disappears immediately, subsequent reads/rename/delete give not found; stored row has `deleted_at`. Repeat child routes after deleting parent. | Vitest integration | P0 | T-07b for spaces, T-10/T-13/T-16 for children; executable now |
| SEC-PAGE-01 | 2 | Signed out, HTTP request `/dashboard`, `/spaces` and an Overview URL: redirect to `/sign-in`. Repeat with expired/forged cookie: page-level session check also denies access. | HTTP integration or manual | P0 | T-07b; executable now with running app |
| SEC-PAGE-02 | 2 | B requests A's Overview: not-found UI; full HTML/streamed payload, title and breadcrumb contain none of A's distinctive space name. A streamed not-found can be HTTP 200. | HTTP integration or manual | P0 | T-07b; executable now with running app |
| SEC-PAGE-03 | 2 | A deletes own space; request its Overview and child pages with old URL/cookie: no details or stale breadcrumb. Refresh previously open tabs and confirm APIs remain denied. | HTTP integration or manual | P1 | T-07b; executable now |
| SEC-COOKIE-01 | 9 | On an authorised HTTPS Preview, inspect real login Set-Cookie: Secure, HttpOnly, SameSite=Lax or Strict. Sign out and verify cookie/session revocation. Record flags only. | Manual | P0 | T-07b; executable now with Preview |
| SEC-OWNER-01 | 1, 2 | Execute every row of the cross-account matrix; collection endpoints filter by session, resource endpoints hide existence. Send foreign IDs in path, body, query and nested arrays where supported. Denied mutations must leave A's rows/files/jobs unchanged. | Vitest integration | P0 | T-07b/T-10/T-13/T-16 as mapped below; future routes planned |
| SEC-UPLOAD-01 | 6 | Upload `invalid-pdf.pdf`, `missing-presentation.pptx` and generated invalid UTF-8/NUL TXT using correct-looking MIME/extension. Complete rejects fake types and removes or retains retryable cleanup state safely; no processing job for invalid content. | Vitest integration + fake Blob | P0 | T-10; executable now |
| SEC-UPLOAD-02 | 6 | Generate valid files exactly at/over `MAX_MATERIAL_BYTES` (10 MB as defined in schema); lie about client size. Server measures bytes and rejects over-limit. Inspect token: one exact path, allowed MIME, max bytes, no overwrite, five-minute expiry. Attempt another path/type, oversized write and expired token. | Integration + manual private-store check | P0 | T-10; executable now |
| SEC-UPLOAD-03 | 6 | Process whitespace-only TXT: normal no-readable-text failure, no Ready content. Generate 200/201-page PDF or slides and 240,000/240,001 cleaned characters: allowed boundary progresses; excess fails safely. Generate compressed expansion stress input at runtime; extraction is bounded or fails without exhausting workers. | Vitest integration | P1 | T-10; executable now; parser resource bounds require verification |
| SEC-UPLOAD-04 | 2, 6 | B uses A's material ID and tries reading its private Blob URL without a storage credential: denied, no bytes/token/path leaked by API. Attempt path traversal/control characters in filename; generated object path stays server-owned and download headers safe. | Integration + manual storage check | P0 | T-10; executable now |
| SEC-UPLOAD-05 | 2, 6 | Repeat/parallel complete and upload same bytes in one space: at most one valid material/job per contract. Cancel while uploading, then complete/retry: no resurrected content or duplicate job; late upload remains bounded by token expiry and cleanup. | Vitest integration | P1 | T-10; executable now |
| SEC-JOB-01 | 2, 7 | Call worker with absent, invalid, expired signature and a body altered after signing: 401, zero job/AI/Blob effects. Validly signed malformed payload gives safe 400. A student cookie alone never grants worker access. | Vitest integration + test signer | P0 | T-10; executable now |
| SEC-JOB-02 | 7 | Deliver same signed step concurrently, then after completion; only one commit. Expire lease, acquire a new claim and resume stale worker: stale claim cannot write. Observe valid duplicate 200/no effect or expired signature 401. | Vitest integration | P0 | T-10; executable now |
| SEC-JOB-03 | 7 | Fail after step commit before publish; expire a lease; reach retry budget. Recovery must republish/reclaim only incomplete work and stop permanent failures without duplicate output. Separate bounded queue/SDK retry totals. | Vitest integration + fake queue/clock | P1 | T-10; claim/retry code exists, durable dispatch/reconciler recovery planned/unverified (R-05) |
| SEC-CRON-01 | 2, 7, 10 | Missing/incorrect `CRON_SECRET` gives 401/no effects; valid secret performs only eligible cleanup. No student cookie substitutes for the secret; never echo it. | Vitest integration | P0 | T-10 or separately scoped cleanup task; planned (route absent) |
| SEC-RAG-01 | 2, 3 | Put nearest vector in B's space and a less similar one in A's. Retrieve as A: B's chunk never returned. Inspect executed SQL: `space_id` and eligibility filters are in the same query, not post-filtered. Repeat with deleted source/parent. | Vitest integration + SQL capture | P0 | T-10 for retrieval, T-13 for generation; executable now |
| SEC-SOURCE-01 | 2, 3 | Generate for A with B's or A's other-space material/topic/chunk IDs, or same-space unselected material. Deny publication; no citation/item crosses selection or ownership. Directly insert mismatched `material_topics` and `item_sources`: database rejects. | Vitest integration | P0 | T-10 for topic FKs; T-13 for generated sources; executable now |
| SEC-ANSWER-01 | 4 | Before submit, inspect full set, attempt, autosave/start/resume and revision-session responses recursively: no correct index/option, model answer, key points, explanation or source answer clues in hidden metadata. After submit, only owner gets results. | Vitest integration | P0 | T-13 for sets; T-16 for attempts/revision; executable now for MCQ |
| SEC-INJECT-01 | 8 | Feed `prompt-injection.txt` and `delimiter-injection.txt` through topic, quiz and answer-check prompts. Verify source delimiters and the final system instruction, including `SOURCE_RULES` appended by `callAI()`, treating source text as untrusted data; structured output and no tools. Invalid schema/source labels are rejected before persistence. | Vitest integration + fake AI | P0 | T-13; executable now; effectiveness requires verification (R-03) |
| SEC-INJECT-02 | 8, 10 | In a separately approved live evaluation, use the synthetic files with permitted material. Outcome must be normal source-grounded topics/questions or a normal safe failure; no system-prompt disclosure, injected marker, external action or unrelated citation. A fake provider cannot establish real model resistance. Record model/prompt version and anonymised verdict only. | Manual AI evaluation | P1 | T-13; requires configured provider and evaluation approval |
| SEC-AI-01 | 8, 10 | Return invalid JSON, unknown labels, duplicate options, unsupported answers and hostile markup from fake AI: schema/domain/checker reject; retries bounded; no partial Ready publication. Render synthetic markup as text, with no script/event execution. | Integration + browser/manual | P1 | T-13; executable now for quizzes; cards planned |
| SEC-SCORE-01 | 1, 5 | Save known displayed answers and submit `score: 100`, `isCorrect: true` and B's student ID: stored score uses server answer keys and original-index mapping; client fields cannot choose result/student. Check null answers separately. | Vitest integration | P0 | T-16; executable now |
| SEC-SCORE-02 | 2, 5 | Autosave an item from another quiz in same space and from B's space. Reject, leave attempt unchanged; direct mismatched `attempt_items` insert fails same-set FK. | Vitest integration | P0 | T-16; executable now |
| SEC-SCORE-03 | 5 | Double/parallel submit yields same stored result once; race autosave and submit: submitted answers/scores immutable; no duplicate revision evidence. | Vitest integration | P0 | T-16; executable now |
| SEC-REVISION-01 | 2, 5 | Review a due item: first success advances 1→3→7 local days, failure resets +1. Repeat request key/concurrent reviews: schedule changes once. B cannot use A's item or request key to retrieve A's result; not-due new request returns safe conflict. | Vitest integration + fixed clock | P1 | T-16; executable now for MCQ; deck ratings planned |
| SEC-PROGRESS-01 | 2, 5 | Only submitted eligible evidence counts; use latest ten distinct questions, <5 insufficient, exact <60% weak. B's responses and removed/deleted sources do not contaminate A's aggregates or revision items. | Vitest integration | P1 | T-16; executable now |
| SEC-DELETE-01 | 2, 6 | Delete material with active work, interrupt Blob deletion and DB deletion separately, retry. Current material contract: Blob first; Blob failure gives 503 and retains row; already-missing Blob is safe to delete. After retirement no retrieval; past results show Source removed. Check late worker cannot republish removed content. | Vitest integration + fake storage | P0 | T-10/T-13/T-16; executable now |
| SEC-DELETE-02 | 2, 6 | Delete a space/account with pending files. Immediately deny all student reads; durable opaque Blob cleanup intent must survive parent cascades/crash and finish on retry. No historical erasure claim before cleanup. | Vitest integration | P0 | T-10 + later deletion/cleanup task; planned beyond Study Space soft delete (R-04) |
| SEC-LIMIT-01 | 7 | Race three generation jobs across steps: at most two hold whole-job slots, third queues; terminal failure/success releases slot. Daily per-student limit 20 uses local midnight and cannot be bypassed by forged user ID or concurrent requests. Fake AI only. | Vitest integration + fake queue/clock | P1 | T-13; executable now for quizzes; deck path planned |
| SEC-SECRET-01 | 10 | Review staged diff, tracked files and fixture bytes for secrets/personal data; ensure `.env.local` ignored and no credential values in history introduced by change. Use an approved local secret scanner if available, documenting version and output. Never upload secrets to a scanner. | Manual + local scan | P0 | T-07a author review now; repeat each PR; scanner not yet run |
| SEC-ERROR-01 | 10 | Inject DB, storage, queue and AI errors containing synthetic secret sentinel: API/UI returns stable safe error, no stack, raw provider output, credential or source text. Inspect server logs and `ai_calls`: only permitted metadata, no prompt/source/token content. | Integration + manual log review | P0 | T-07b for auth, T-10/T-13/T-16 for features; executable now |
| SEC-REQUEST-01 | 2, 9 | Send state-changing auth/app requests from an untrusted Origin, missing required CSRF material and cross-site context. Verify intended Origin/SameSite/CSRF protection, no side effects. Test allowed same-origin control. Record actual app-route policy; do not infer it from Better Auth's policy. | HTTP integration/manual | P1 | T-07b auth, later security evaluation for all app routes; executable now, policy unverified (R-08) |

## Cross-account route matrix

All rows also inherit SEC-AUTH-02 when implemented. For scoped routes, use A's ID with B's cookie, then a nonexistent ID with B's cookie: **same 404 status and body**, no changes. A source/topic/item ID from a different quiz or space must fail even if B owns the outer resource. Resource-specific expected codes come from checked-in feature schemas/services.

Collections and self-account endpoints have no foreign resource in their path: the correct expectation is an owner-filtered result or an operation on B alone, **not** an invented 404 for an otherwise valid collection request. Unknown `userId`/`ownerId` values must never change identity. This clarifies #19's blanket “every attempt gets 404” wording using Section 4's actual contracts; it does not introduce a new API contract.

| Method | Student route | B's attack and expected outcome | Case / executable task | Current target |
| --- | --- | --- | --- | --- |
| GET | `/api/spaces` | List as B with A's owner query: only B's spaces | SEC-SPACE-01 / T-07b | Exists |
| POST | `/api/spaces` | Send A's ownerId: new space belongs to B | SEC-SPACE-04 / T-07b | Exists |
| PATCH | `/api/spaces/:spaceId` | A's space: same space 404; unchanged | SEC-SPACE-02 / T-07b | Exists |
| DELETE | `/api/spaces/:spaceId` | A's space: same space 404; unchanged | SEC-SPACE-02 / T-07b | Exists |
| GET | `/api/spaces/:spaceId/materials` | A's space: same space 404; no material metadata | SEC-OWNER-01 / T-10 | Exists |
| POST | `/api/spaces/:spaceId/materials` | A's space: same space 404; no token/row/job | SEC-OWNER-01 / T-10 | Exists |
| POST | `/api/materials/:id/complete` | A's material: same material 404; no job | SEC-OWNER-01 / T-10 | Exists |
| POST | `/api/materials/:id/retry` | A's failed material: same material 404 | SEC-OWNER-01 / T-10 | Exists |
| GET | `/api/materials/:id/file` | A's material: same material 404; zero file bytes | SEC-UPLOAD-04 / T-10 | Exists |
| DELETE | `/api/materials/:id` | A's material: same material 404; Blob/row intact | SEC-OWNER-01 / T-10 | Exists |
| GET | `/api/spaces/:spaceId/topics` | A's space, including archived/unlinked queries: same space 404 | SEC-OWNER-01 / T-10 | Exists |
| POST | `/api/spaces/:spaceId/topics` | A's space: same space 404; no topic | SEC-OWNER-01 / T-10 | Exists |
| GET | `/api/materials/:id/topic-draft` | A's material: same material 404; no source/topic text | SEC-OWNER-01 / T-10 | Exists |
| PUT | `/api/materials/:id/topic-draft` | A's material: same material 404; draft unchanged | SEC-OWNER-01 / T-10 | Exists |
| POST | `/api/materials/:id/topic-draft/confirm` | A's material: same material 404; no links confirmed | SEC-OWNER-01 / T-10 | Exists |
| PATCH | `/api/topics/:id` | A's topic: same topic 404; name/status unchanged | SEC-OWNER-01 / T-10 | Exists |
| GET | `/api/spaces/:spaceId/sets` | A's space for each supported kind: same space 404 | SEC-OWNER-01 / T-13 | Quiz exists; deck planned |
| POST | `/api/spaces/:spaceId/sets` | A's space: same space 404; no charged job; mix foreign sources into B's valid space separately | SEC-OWNER-01, SEC-SOURCE-01 / T-13 | Quiz exists; deck planned |
| GET | `/api/sets/:id` | A's set: same set 404; no question/answer | SEC-OWNER-01 / T-13 | Exists for quiz |
| DELETE | `/api/sets/:id` | A's set: same set 404 before result-state checks; row intact | SEC-OWNER-01 / T-13 | Exists for quiz |
| POST | `/api/sets/:id/attempts` | A's set: same set 404; no attempt | SEC-OWNER-01 / T-16 | Exists |
| GET | `/api/attempts/:id` | A's in-progress/submitted attempt: same attempt 404 | SEC-OWNER-01 / T-16 | Exists |
| PATCH | `/api/attempts/:id/answers` | A's attempt: same attempt 404; answer unchanged | SEC-OWNER-01, SEC-SCORE-02 / T-16 | Exists |
| POST | `/api/attempts/:id/submit` | A's attempt: same attempt 404; no result/revision | SEC-OWNER-01 / T-16 | Exists |
| POST | `/api/items/:id/rating` | A's item/session: same missing-resource 404, contract to confirm when built | SEC-OWNER-01 / later cards task, tracked by T-16 | Planned |
| POST | `/api/sets/:id/practice` | A's deck: same set 404; no deck session | SEC-OWNER-01 / later cards task, tracked by T-16 | Planned |
| GET | `/api/progress` | As B: only B's spaces/evidence, no A names or totals | SEC-PROGRESS-01 / T-16 | Exists |
| GET | `/api/spaces/:spaceId/progress` | A's space: same space 404 | SEC-OWNER-01 / T-16 | Exists |
| GET | `/api/topics/:id/mastery` | A's topic: same topic 404; no evidence counts | SEC-OWNER-01 / T-16 | Exists |
| GET | `/api/revision` | As B: only B's items/due counts | SEC-OWNER-01 / T-16 | Exists |
| POST | `/api/revision/session` | As B: only B's eligible items; no A prompts or keys | SEC-OWNER-01 / T-16 | Exists |
| POST | `/api/revision/items/:id/review` | A's revision item: same revision-item 404; schedule unchanged | SEC-REVISION-01 / T-16 | Exists |
| POST | `/api/items/:id/report` | A's item: same missing-resource 404; no report/removal, contract to confirm | SEC-OWNER-01 / later reports task | Planned |
| GET | `/api/notifications` | As B with A's IDs in query: only B's jobs | SEC-OWNER-01 / later notifications task | Planned |
| POST | `/api/notifications/seen` | Send A's userId: marks only B's seen time | SEC-OWNER-01 / later notifications task | Planned |
| PATCH | `/api/account/profile` | Send A's ID/role: cannot mutate A or elevate B | SEC-OWNER-01 / later account task | Planned; Better Auth update exists separately |
| DELETE | `/api/account` | Send A's ID: never deletes A; only B under agreed account-delete confirmation | SEC-OWNER-01, SEC-DELETE-02 / later account task | Planned |
| Per Better Auth contract | `/api/auth/*` | Public Google entry points need no session; session/update/sign-out operate only on caller. Test tampered role/identity, CSRF, session revocation, email-login refusal; no blanket 404 policy | SEC-AUTH-01–08, SEC-REQUEST-01 / T-07b | Exists |

Public `/sign-in` and `/privacy` must remain reachable signed out and disclose no private student data. `POST /api/jobs/step` is covered by SEC-JOB-01/02 and planned `GET /api/cron/cleanup` by SEC-CRON-01; neither uses a student-cookie cross-account contract.

## Rule coverage, evidence and review

| Section 4 rule | Minimum cases |
| --- | --- |
| 1: session identity | SEC-AUTH-01/04, SEC-SPACE-04, SEC-SCORE-01 |
| 2: authentication and ownership | SEC-AUTH-02, SEC-OWNER-01, SEC-PAGE-01/02, SEC-CRON-01 |
| 3: scoped vectors | SEC-RAG-01, SEC-SOURCE-01 |
| 4: hidden answers | SEC-ANSWER-01 |
| 5: server scores | SEC-SCORE-01/02/03, SEC-REVISION-01 |
| 6: private uploads/downloads | SEC-UPLOAD-01–05, SEC-DELETE-01/02 |
| 7: signed workers | SEC-JOB-01–03, SEC-CRON-01, SEC-LIMIT-01 |
| 8: untrusted source text | SEC-INJECT-01/02, SEC-AI-01 |
| 9: Google-only sessions | SEC-AUTH-02/03/05/07/08, SEC-COOKIE-01 |
| 10: secrets and safe errors | SEC-SECRET-01, SEC-ERROR-01 |

When executed, record case ID, commit, environment label (no connection string), tool version, date, pass/fail/blocked, anonymised evidence location and linked bug. Store results under `docs/evaluation/results/`; do not turn planned cases into pass claims. For a failure, capture a synthetic reproduction, report to the owning teammate and link its issue; keep application fixes out of T-07a. ZAP is a later authorised evaluation against a test deployment, not part of this change.

Review status: Arya **pending**; Rashid **pending**. The author must reconcile the T-07b draft's additional coverage against this catalogue (especially SEC-AUTH-04/06/07/08); retaining its IDs alone does not prove all these cases are automated.

## Author validation — 20 November 2026

- Verified 44 unique catalogue case IDs; all explicit case references in the three security documents resolve to catalogue entries.
- Checked relative Markdown document links and confirmed every committed fixture candidate is listed in its README.
- Inspected fixture structure: fake PDF has no PDF header; PPTX is a readable ZIP with exactly one synthetic text entry and no presentation entry; whitespace input has no non-whitespace characters. Every fixture, including its README, is under 8 KiB.
- Compared the route matrix against Section 4 and checked all 30 implemented student API methods appear, retaining planned routes and documenting collection/auth exceptions to resource 404 checks.
- Lint and TypeScript checks passed. `pnpm build` compiled and completed its TypeScript phase, then failed prerendering `/sign-in` because the existing local application environment variables are missing. No application changes were made to bypass that prerequisite.
- No application security assertions, live provider calls, local secret scanner or ZAP scan were run. No reviewer approval or external bug-report submission is claimed. Files contain synthetic text and variable names only; application code, scripts, migrations and package configuration are unchanged.
