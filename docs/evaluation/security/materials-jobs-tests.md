# T-10: material and worker security tests

Owner: Khushi. Issue: [#55](https://github.com/Aryasuwegatama/ai-study-coach/issues/55). Branch: `test/T-10-materials-jobs`. Baseline: `main` at `b379aff`. Recorded 23 November 2026.

## Status

All **62 tests passed on two consecutive full runs**: 30 database-free tests and 32 integration tests. The separate `test` database was verified before applying the 12 existing migrations. The setup/helpers from [#20](https://github.com/Aryasuwegatama/ai-study-coach/issues/20) were temporarily loaded from its saved local branch for verification, not duplicated in this branch's commit. A fresh checkout still needs that reviewed infrastructure merged. Real private-store enforcement, review and merge remain outstanding; this task is not yet Done.

No application code, existing scripts, schema, migrations or dependency files changed. The superseded T-15a draft was preserved in a named Git stash before this branch was created; it is not included in T-10. The T-10 task-map row records actual progress. No credentials or real lecture files are embedded in the tests; the private connection settings are loaded from the ignored local environment.

## Running

T-10 uses **the Vitest dependency already prepared by T-07b**. It is not currently declared on main; these local checks used the existing installation from that task. On a fresh checkout, merge the reviewed #20 setup first, then `pnpm install`. Do not add a duplicate runner or commit a separate dependency change here.

Database-free checks:

```powershell
pnpm exec vitest run --config tests/materials-jobs.config.mts --project t10-unit
```

All T-10 checks (requires #20 and a privately configured, dedicated `DATABASE_URL_TEST`):

```powershell
pnpm exec vitest run --config tests/materials-jobs.config.mts
```

Integration only:

```powershell
pnpm exec vitest run --config tests/materials-jobs.config.mts --project t10-integration
```

The scoped config separates database-free and database-dependent suites. `materials-shared-setup.ts` imports #20's original `test-database-setup.ts`; it does not implement another environment loader, migration/reset routine or pool. The integration fixture calls #20's original `createTestStudents()`; it does not create a second auth factory. Until those files land, the missing-setup error remains intentional. The full suite passed twice using that setup locally. The existing broad `pnpm test` command from #20 will also discover these test files.

## What the suites exercise

| File | Cases / actual boundaries |
| --- | --- |
| `tests/unit/materials-file-security.test.ts` | SEC-UPLOAD-01/02/03: invalid extension/bytes, malformed UTF-8/NUL, empty and whitespace text, valid generated PDF/PPTX/TXT, SHA-256, exact byte and extracted-character caps, 200/201 page/slide boundaries, presentation relationship order, spoofed presentation marker and declared ZIP expansion cap. Real check/extraction functions; no database. |
| `tests/unit/materials-worker-signature.test.ts` | SEC-JOB-01/03 and SEC-ERROR-01: absent/wrong/expired/tampered signatures; cookie-only denial; signed bad payload; current and next keys; safe retry and error envelopes. Uses the real QStash Receiver and real route; **dispatch is mocked**, so these tests do not prove job idempotency. |
| `tests/unit/materials-storage-capability.test.ts` | SEC-UPLOAD-02: the real storage adapter passes exact path, MIME, maximum bytes, expiry and no-overwrite options to the SDK. The token SDK call is mocked; provider enforcement is not established. |
| `tests/integration/materials-upload-ownership.test.ts` | SEC-OWNER-01, SEC-UPLOAD-01/02/04/05, SEC-DELETE-01: real sessions/routes/database, no-session checks, foreign/malformed/missing/deleted material denial, deleted-space denial, request identity/path tampering, server-measured size, duplicate completion/uploads and races, concurrent 20-file admission, rejection cleanup, cancel, private attachment bytes and interrupted/missing-Blob deletion. **Passed in both full runs.** |
| `tests/integration/materials-worker-retry.test.ts` | SEC-JOB-02/03, SEC-DELETE-01: real signature route, runner, transactions, claims and extraction; fake storage/publisher. Controlled concurrent delivery/replay, live/expired lease, stale claim, exact retry budget, explicit Retry reusing its job, permanent failure, publish failure and deletion mid-read. **Passed in both full runs.** |
| `tests/integration/materials-source-isolation.test.ts` | SEC-RAG-01, SEC-SOURCE-01, SEC-OWNER-01: actual pgvector retrieval with B's vector closer than A's, same-owner different-space vectors, selected-material filtering and inspection of executed SQL; direct chunk/topic composite-FK rejection; foreign topic denial; injected topic ID cannot edit/reparent an existing foreign topic; chunk cascade deletion and parent ownership gate. **Passed in both full runs.** |

Case IDs follow the catalogue proposed in [T-07a PR #51](https://github.com/Aryasuwegatama/ai-study-coach/pull/51); reconcile reviewed definitions when it merges. Fixtures here are generated at runtime, so the pending PR's binary fixtures were not copied into this branch. Add reviewed committed fixture paths when available if they cover additional behaviour. Quiz publication/item-source membership and live prompt-injection evaluation remain T-13; scoring remains T-16.

## Fakes, cleanup and interpretation

- The integration storage fake is imported before application modules, retains synthetic byte buffers and returns fresh streams. It can pause reads and fail deletion. It does not claim to enforce real upload tokens, private-store access, expiry or network policies.
- Only external storage and publishing are replaced. Real sessions, owner checks, feature services, migrations/schema constraints and database claim/lease transactions remain in use. `AI_PROVIDER=fake` comes from #20; these tests execute extraction steps, not real model calls.
- Integration data consists of two students and three spaces (including two for A). Cleanup removes jobs scoped to those exact synthetic spaces before delegating user/cascading-row deletion to #20. Fake state and publisher overrides reset in `finally`. It never truncates tables or clears all users/jobs.
- Concurrent delivery is coordinated by a controlled fake read rather than a sleep. Stale-claim tests replace the database token during external work. The retry test reads the current `MAX_STEP_ATTEMPTS` constant instead of assuming a different budget.
- `searchChunks()` explicitly requires an already-authorised caller. Its SQL filters space, selected materials and embedding model; it does not itself check the parent space's ownership/deletion. Tests therefore exercise `requireSpace()` as the caller gate rather than making an unsupported claim that raw retrieval rejects every deleted space.
- Draft saves currently treat an unknown supplied topic ID as a new local draft entry. The test asserts the foreign topic remains unchanged and its ID is not reparented; it does not invent an error contract.
- The ZIP stress case changes declared size in a tiny archive. It checks early bounded rejection without constructing an uncontrolled decompression bomb or committing a large binary.

## Checks actually run

| Check | Result |
| --- | --- |
| Database-free Vitest suites | 30 passed, three files; repeated in both full runs. These unit suites make no database/provider calls. |
| Complete scoped Vitest command | **62/62 passed twice**, six files, approximately 77 seconds per run. Includes all 32 database integration cases. |
| Test database and cleanup | Server database identity verified as `test`, distinct from app DB; pgvector available; 12 existing migrations applied; no remaining synthetic users after checks. |
| Existing `check:materials-contract` | 39 checks passed. Auth/space check scripts also passed with test DB and temporary synthetic non-database settings; no real Google login. |
| `pnpm exec next typegen` | Passed |
| `pnpm exec eslint .` | Passed |
| `pnpm exec tsc --noEmit` | Passed after replacing a regex flag unsupported by the repository's ES2017 target |
| `pnpm build` | Passed with temporary synthetic environment values, fake AI and an unreachable local placeholder database URL. No migration or real service call was performed. This verifies compilation/prerendering, not live configuration. |
| Scope review | Application code, check scripts, schema/migrations and package/lockfile unchanged |

The build's temporary values were not written into `.env.local`. Rebuild with proper settings before using the app normally. Raw test output/paths, tokens and student material are not committed as evidence.

## Remaining work before completion

- [ ] Merge/reconcile #20's reviewed setup and Vitest dependency so a fresh checkout can reproduce the verification without the temporary overlay.
- [x] Run the full suite twice and verify cleanup on both success and injected failures. Both runs passed; synthetic users were absent afterwards.
- [ ] Report actual application defects to Rashid/Arya separately, linking any known-failing or skipped regression. No application defect was established by the passing unit tests in this run.
- [ ] Verify the independent private Blob service rejects another path/type, oversized writes, overwrite, expired capabilities and unauthenticated direct reads, using an approved isolated test store. SDK option mapping alone cannot prove these checks.
- [x] Validate the shared setup refuses missing/same-database targets, pooled/direct aliases and a Production environment. All four refusal checks passed using synthetic unreachable endpoints, never the app database.
- [ ] Cover/document process termination between commit and publish, across retry delivery expiry and during whole-parent cleanup. [T-08a PR #28](https://github.com/Aryasuwegatama/ai-study-coach/pull/28) explicitly records the missing cron reconciliation path; T-10 does not add a reconciler or claim that a synchronous publish-failure test proves crash recovery. A separately linked fix/recovery task is needed if this remains absent.
- [ ] Run real-storage-dependent `check:materials`, `check:processing` and `check:topics` when the private test store/settings are configured. `check:materials-contract` and auth/space scripts passed locally as recorded above.
- [ ] Have Rashid review upload/worker/retrieval tests and Arya review shared setup/auth/storage assumptions; then prepare the PR with `Closes #55`. No review, PR or merge is claimed yet.

### Verification notes

The first database run exposed test-only issues: Vitest cannot directly export its hoisted storage variable, and the existing Retry route returns 202 Accepted. Correcting the helper export and those two expected statuses made the worker cases pass. No application fix or migration edit was required. The real production application was not targeted. Private-store enforcement is still not established by the fake adapter.
