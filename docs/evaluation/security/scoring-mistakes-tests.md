# T-16: scoring and mistakes-review security

Issue: [#60](https://github.com/Aryasuwegatama/ai-study-coach/issues/60). Owner: Khushi. Branch: `test/T-16-scoring`.

T-14 (#32) and T-15's updated mistakes contract (#52) are merged. The old task-table prerequisite status is stale. This branch uses the shared session/database setup from [#56](https://github.com/Aryasuwegatama/ai-study-coach/pull/56), with no dependency on T-10 or T-13 and no copied test runner/migration logic. Case IDs follow the proposed T-07a catalogue in [#51](https://github.com/Aryasuwegatama/ai-study-coach/pull/51).

## Automated coverage

| Case | Evidence |
| --- | --- |
| SEC-SCORE-01 | Send forged score, total, identity, correctness, answer-key and option-order fields. Force a non-identity displayed-option permutation in the test fixture, then verify real autosave mapping, mixed correct/wrong/unanswered score, stored ownership and mistake rows. Clear-to-null and malformed displayed indexes have separate checks. |
| SEC-SCORE-02 | Real authenticated route calls reject items from another quiz in the same space and another student's quiz without changing the attempt. Composite foreign keys reject direct mismatched attempt/item insertion. Foreign-attempt save/submit cannot mutate the owner's rows. |
| SEC-SCORE-03 | Three parallel starts yield one attempt snapshot. Parallel/repeated submits return the same stored response and create one mistake per wrong item. Autosave/submit races allow either serialized outcome while requiring the stored correctness and score to match the final saved answers. Post-submission autosave is rejected with no mutation. |
| SEC-REVISION-01, SEC-ANSWER-01 | Review list contains only public question fields and no explanation canary. Owner check returns the answer only after checking. Invalid scopes, answers and request keys cause no writes. Both valid request-key length boundaries are accepted. |
| SEC-REVISION-01 | Same-key changed-body replay and concurrent same-key checks create one event and preserve the first answer/outcome. Separate keys create separate events. Keys are scoped to the mistake, not shared across students' items. Foreign/missing/malformed/empty IDs have identical full not-found errors and cannot retrieve another student's cached result. |
| SEC-REVISION-01 | Wrong check remains open, correct clears, later wrong check does not reopen a cleared mistake. Later wrong/correct quiz submissions reopen/clear the same mistake row. Removed question, archived topic, lost source and deleted parent make a mistake ineligible and prevent event writes. |
| SEC-REVISION-01, SEC-SCORE-03 | Review checks leave full submitted attempt/item rows and mastery evidence unchanged. Mastery begins with one wrong answered question in the fixture, so this is not a comparison of two empty results. |

## Current contract and catalogue reconciliation

The proposed #51 SEC-REVISION-01 still describes a due-date schedule. T-15/#52 replaced scheduling with open/cleared mistakes: there are no 1/3/7-day transitions or not-due conflicts. These tests exercise the current `revision-schemas.ts` contract. Reconcile that case's wording when reviewing #51; do not restore obsolete scheduling code.

Same-key replay preserves the original event and outcome. Its `cleared` flag follows the current contract: it is true if the original outcome was correct or the mistake is currently cleared. The tests asserting identical full replay responses do so without an intervening different-key state change.

## Reproduction and isolation

Use the repository's existing dedicated PostgreSQL test database (`DATABASE_URL_TEST`, separate from app/direct database URLs), with pgvector available for the shared migrations. The unchanged #56 guard refuses Production and the app database, and substitutes synthetic external service settings. No real AI, queue, storage or Google calls are needed or performed.

```sh
pnpm exec vitest run tests/integration/scoring-integrity.test.ts tests/integration/mistakes-integrity.test.ts
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

`scoring-test-fixture.ts` uses the shared real-session student factory, then seeds two synthetic courses and source-backed quizzes. It creates no background jobs or external files. Cleanup deletes only those exact user IDs, cascading their sessions, spaces, materials, questions, attempts, mistakes and review events. Fixtures also clean up if setup fails. Tests invoke the actual exported API handlers with real cookies and inspect real database rows/constraints/transactions. Concurrency is exercised by overlapping calls with `Promise.all`; autosave/submit ordering is deliberately not assumed.

## Verification

Verified on 23 November 2026:

- `pnpm test`: **37 passed, 2 skipped** across five files in 127.68 seconds. This includes **23 T-16 tests** (9 scoring and 14 mistakes tests) and 14 existing auth/ownership tests. Only the optional protected-page file's two HTTP tests were skipped; no T-16 case was skipped.
- After strengthening the assertions that reviews actually succeeded, the final `mistakes-integrity.test.ts` file was rerun: **14/14 passed** in 80.40 seconds.
- `pnpm exec tsc --noEmit`, `pnpm lint` and `git diff --check`: passed.
- Read-only post-run query: **0** synthetic `security-%@example.com` users remained in the isolated test database. The schema cascades fixture-owned data with those users.

The runner's existing forward-looking Vite config-loader warning did not fail the tests. This task changes only tests and documentation; it adds no application, schema, dependency or environment-file changes. A production build was not repeated for this test-only change.

## Limits and review

These are local handler/database integration tests, not browser tests, deployed HTTP checks or a load/latency test. They cover the named race invariants, not every possible interleaving. Full mastery-window and analytics presentation correctness are outside this task; review isolation is verified against the real mastery query. No real-provider or live-model claim is made. The two optional protected-page HTTP tests are separate and need `AUTH_PAGE_TESTS=1` with a current build.

Keep #60 open until review and merge. If #56 is still open, target its branch with a draft PR; merge #56 first, merge current main into T-16, retarget the PR to main, inspect the scoped diff and request review. T-13's prompt fix and its live-model evaluation remain separate in #58/#59.
