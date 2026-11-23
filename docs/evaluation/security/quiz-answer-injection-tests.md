# T-13: quiz answer privacy, injection and forged IDs

Issue: [#58](https://github.com/Aryasuwegatama/ai-study-coach/issues/58). Branch: `test/T-13-answers-injection`. Owner: Khushi. T-11b (#31) is merged. The branch depends on the shared auth/database test infrastructure in [#56](https://github.com/Aryasuwegatama/ai-study-coach/pull/56); no T-10 files or duplicate runner/setup are introduced. Case IDs below follow the proposed T-07a catalogue in [#51](https://github.com/Aryasuwegatama/ai-study-coach/pull/51), pending its review.

## Coverage

| Cases | Automated checks |
| --- | --- |
| SEC-ANSWER-01 | Recursively inspect full set/list/start/resume/read/autosave responses; forbid answer fields, source excerpts, explanation canary and option mapping. Positive post-submission result check; foreign student cannot obtain it. |
| SEC-OWNER-01, SEC-SPACE-05 | Foreign, absent, malformed and empty handler parameters produce identical full error bodies within each resource family; denied set/attempt writes leave rows unchanged. Deleted parent denies child operations. |
| SEC-SOURCE-01, SEC-SCORE-02 (security boundary only) | Foreign/other-space material and topic IDs, and topics outside the selected materials, create no set/job. An item from another quiz or account cannot be autosaved into this attempt. Real composite item-source FK rejects cross-space citation. |
| SEC-RAG-01, SEC-SOURCE-01 | Real pgvector retrieval plan contains only chunks from the chosen material. Accepted items persist citations to those chunks, with no foreign/unselected text in the generation prompts. |
| SEC-INJECT-01 | Unknown labels, raw foreign chunk UUID, duplicate options/questions, invalid schema, unsupported/ambiguous/missing verdict rejected. Five accepted items publish; fewer fail and remove partial items/citations. Generating items remain absent from the public response. |
| SEC-INJECT-01 | Hostile source and question/topic/option text cannot create structural source/question/system tags. Real `callAI()` gateway path, with only its SDK/model/logging adapters mocked, appends final source rules, requests structured output, omits tools, disables SDK retries and supplies an abort signal. |

## Reproduced weakness and fix

On 23 November 2026 the first prompt-boundary run reproduced two failing assertions: delimiter-spoofing text created an extra `<source>` boundary, and supplied question/topic text emitted literal `<system>` tags. These are reproducible prompt-construction weaknesses; they are not evidence that a live model obeyed the injected instruction.

The fix entity-escapes supplied text/attributes in the topic, quiz-write and quiz-answer-check builders, including previously generated questions and options. Versions become `topics-v2`, `quiz-v3` and `check-v2`. The final shared `SOURCE_RULES` explicitly treats supplied source/topic/question/option text as data, including escaped tags. That shared instruction also applies to existing card calls; card prompt construction and live card-injection evaluation are outside this test scope. Entity escaping protects structural delimiters, not all semantic injection attacks. No database/schema/API response changes are needed.

## Reproduction and isolation

Install dependencies and configure the existing `DATABASE_URL_TEST` as a separate PostgreSQL database with pgvector. The unchanged #56 setup refuses the app database and Production, loads migrations, substitutes synthetic service settings and uses `AI_PROVIDER=fake`. Real service secrets are not needed or committed.

```sh
pnpm exec vitest run tests/integration/quiz-answer-security.test.ts tests/integration/quiz-generation-security.test.ts tests/integration/quiz-prompt-security.test.ts
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Integration fixtures create two students, three spaces, selected/unselected/foreign sources and real sessions. Cleanup deletes only jobs in the fixture's tracked spaces, then those exact users (cascading their children). External queue publishing is mocked; generation uses the real validation wrapper with scripted fake output and real database transactions. API tests invoke exported route handlers with real session cookies; they are not browser or deployed HTTP checks. The prompt tests reuse #51's text fixtures when present, otherwise use equivalent inline synthetic attacks; no pending fixture files are copied.

## Verification evidence

Initial run: 22 integration tests passed. Initial prompt regression run: 3 passed, 2 failed, reproducing the delimiter weakness before its fix.

Final verification on 23 November 2026:

- `pnpm test`: **43 passed, 2 skipped** across six files in 126.44 seconds. This includes **29 T-13 tests** (10 API/answer-boundary, 14 generation, 5 prompt/wrapper) plus 14 existing auth/ownership tests. Only the two optional protected-page tests were skipped; no T-13 test was skipped.
- `pnpm exec tsc --noEmit`, `pnpm lint` and `git diff --check`: passed.
- `pnpm build`: passed with temporary synthetic external-service settings and an unreachable localhost app database; no application database or real AI provider was used by the build.
- Read-only cleanup check: **0** synthetic `security-%@example.com` users remain in the test database. Fixture jobs are explicitly removed before user cascades.

The Vite runner emits its existing forward-looking config-loader warning; it does not fail the run. No live provider result is implied by these checks.

## Limits and review

SEC-INJECT-02 live-provider evaluation has not been performed. Fake/model-SDK fixtures cannot establish live-model resistance, factual answer quality or absence of answer clues in natural-language questions. Structured output controls shape; it does not make arbitrary generated prose trustworthy. No real AI, QStash, Blob or OAuth provider calls are made. Scoring/mastery correctness and concurrency remain T-16; upload and worker-signature checks remain T-10. The two optional protected-page HTTP tests require `AUTH_PAGE_TESTS=1` and a current build; ordinary `pnpm test` skips them.

Keep #58 open until review and merge. If #56 is still unmerged, open the T-13 PR against its branch; merge #56 first, merge current main into this branch, retarget the PR to main, inspect the resulting diff and request review of the T-13 changes and prompt fix.
