# T-10: material and worker security tests

Owner: Khushi. Issue: [#55](https://github.com/Aryasuwegatama/ai-study-coach/issues/55). Branch: `test/T-10-materials-jobs`. Baseline: `main` at `b379aff`. Recorded 23 November 2026.

## Status

All **62 T-10 tests passed on two consecutive full runs**: 30 database-free tests and 32 integration tests. The separate `test` database was verified before applying the 12 existing migrations. This branch now includes the shared setup from [PR #56](https://github.com/Aryasuwegatama/ai-study-coach/pull/56) as a Git dependency, so verification no longer needs a temporary file overlay. T-10's PR is based on that branch to keep its diff limited to T-10; merge #56 first, then retarget T-10 to main. Review and merge remain outstanding. Live provider calls are explicitly outside #55's scope; the SDK-versus-provider distinction remains documented rather than treated as a false passing result.

T-10's diff against #56 changes no application code, existing scripts, schema, migrations or dependency files. The inherited setup/package changes belong to #56. The superseded T-15a draft was preserved in a named Git stash and is not included. The T-10 task-map row records actual progress. No credentials or real lecture files are embedded in the tests; private connection settings are loaded from the ignored local environment.

## Running

T-10 uses **T-07b's Vitest dependency and setup from #56**, inherited in this dependent branch. On checkout run `pnpm install` and privately configure the dedicated test database. No duplicate runner or dependency change is introduced by T-10. For merging into main, #56 must land first.

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

The scoped config separates database-free and database-dependent suites. `materials-shared-setup.ts` imports #20's original `test-database-setup.ts`; it does not implement another environment loader, migration/reset routine or pool. The integration fixture calls #20's original `createTestStudents()` rather than a second auth factory. Both files are inherited from #56. The broad `pnpm test` command also discovers these test files; `AUTH_PAGE_TESTS=1` enables #20's two optional HTTP tests when a current local build is available.

## What the suites exercise

| File | Cases / actual boundaries |
| --- | --- |
| `tests/unit/materials-file-security.test.ts` | SEC-UPLOAD-01/02/03: invalid extension/bytes, malformed UTF-8/NUL, empty and whitespace text, valid generated PDF/PPTX/TXT, SHA-256, exact byte and extracted-character caps, 200/201 page/slide boundaries, presentation relationship order, spoofed presentation marker and declared ZIP expansion cap. Real check/extraction functions; no database. |
| `tests/unit/materials-worker-signature.test.ts` | SEC-JOB-01/03 and SEC-ERROR-01: absent/wrong/expired/tampered signatures; cookie-only denial; signed bad payload; current and next keys; safe retry and error envelopes. Uses the real QStash Receiver and real route; **dispatch is mocked**, so these tests do not prove job idempotency. |
| `tests/unit/materials-storage-capability.test.ts` | SEC-UPLOAD-02: the real storage adapter passes exact path, MIME, maximum bytes, expiry and no-overwrite options to the SDK. The token SDK call is mocked; provider enforcement is not established. |
| `tests/integration/materials-upload-ownership.test.ts` | SEC-OWNER-01, SEC-UPLOAD-01/02/04/05, SEC-DELETE-01: real sessions/routes/database, no-session checks, foreign/malformed/missing/deleted material denial, deleted-space denial, request identity/path tampering, server-measured size, duplicate completion/uploads and races, concurrent 20-file admission, rejection cleanup, cancel, private attachment bytes and interrupted/missing-Blob deletion. **Passed in both full runs.** |
| `tests/integration/materials-worker-retry.test.ts` | SEC-JOB-02/03, SEC-DELETE-01: real signature route, runner, transactions, claims and extraction; fake storage/publisher. Controlled concurrent delivery/replay, live/expired lease, stale claim, exact retry budget, explicit Retry reusing its job, permanent failure, publish failure and deletion mid-read. **Passed in both full runs.** |
| `tests/integration/materials-source-isolation.test.ts` | SEC-RAG-01, SEC-SOURCE-01, SEC-OWNER-01: actual pgvector retrieval with B's vector closer than A's, same-owner different-space vectors, selected-material filtering and inspection of executed SQL; direct chunk/topic composite-FK rejection; foreign topic denial; injected topic ID cannot edit/reparent an existing foreign topic; chunk cascade deletion and parent ownership gate. **Passed in both full runs.** |

Case IDs follow the catalogue proposed in [T-07a PR #51](https://github.com/Aryasuwegatama/ai-study-coach/pull/51); reconcile review changes when it merges. The file-test helper reads its shared fake-PDF, missing-presentation and whitespace fixtures when present; until then it generates equivalent small inputs at runtime. The pending PR's binary files are not duplicated. Large boundary inputs are always generated. Quiz publication/item-source membership and live prompt-injection evaluation remain T-13; scoring remains T-16.

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
| Combined dependency and T-10 run | `AUTH_PAGE_TESTS=1 pnpm test`: **78/78 passed twice**, nine files, approximately 112 seconds per run. This verifies the actual dependent branch without temporary copied files; includes #56's 16 cases and all 62 T-10 cases. |
| Test database and cleanup | Server database identity verified as `test`, distinct from app DB; pgvector available; 12 existing migrations applied; no remaining synthetic users after checks. |
| Existing `check:materials-contract` | 39 checks passed. Auth/space check scripts also passed with test DB and temporary synthetic non-database settings; no real Google login. |
| `pnpm exec next typegen` | Passed |
| `pnpm exec eslint .` | Passed |
| `pnpm exec tsc --noEmit` | Passed after replacing a regex flag unsupported by the repository's ES2017 target |
| `pnpm build` | Passed with temporary synthetic environment values, fake AI and an unreachable local placeholder database URL. No migration or real service call was performed. This verifies compilation/prerendering, not live configuration. |
| Scope review | Application code, check scripts, schema/migrations and package/lockfile unchanged |

The build's temporary values were not written into `.env.local`. Rebuild with proper settings before using the app normally. Raw test output/paths, tokens and student material are not committed as evidence.

## Completion and review

- [x] Reuse #56's setup through the branch dependency, without duplicated code or an overlay.
- [x] Run the scoped suite twice and verify cleanup on success and injected failures. Both runs passed; synthetic users were absent afterwards.
- [x] Verify missing/same-database, pooled/direct-alias and Production refusal guards with synthetic unreachable endpoints.
- [x] Document the commit/publish recovery gap already recorded in [T-08a PR #28](https://github.com/Aryasuwegatama/ai-study-coach/pull/28). No reconciler is implemented and no synchronous failure test is claimed to prove crash recovery. Missing cron/whole-parent recovery is a separate feature task, as #55 specifies.
- [x] Preserve real-service boundaries: SDK options are asserted, while actual private-store enforcement is explicitly unverified. Real provider calls are out of scope in #55, so this is a separate service-configuration check rather than unfinished T-10 test code.
- [ ] Arya and Rashid review the test coverage, dependency and recorded limitations; #56 merges, then T-10 retargets main and merges. No approval or merge is claimed.

No application defect was established by the passing tests, and no known-failing application case was silently skipped. Real-storage-dependent `check:materials`, `check:processing` and `check:topics` were not run because their private provider configuration is absent. #55 allows these results to be recorded when available; they are not replaced with fake passing claims. `check:materials-contract` and auth/space checks passed locally as recorded above.

### Verification notes

The first database run exposed test-only issues: Vitest cannot directly export its hoisted storage variable, and the existing Retry route returns 202 Accepted. Correcting the helper export and those two expected statuses made the worker cases pass. No application fix or migration edit was required. The real production application was not targeted. Private-store enforcement is still not established by the fake adapter.
