# AI smoke test results

Run with `pnpm run check:ai` (`scripts/check-ai.ts`). Two generations of results: the original T-02 spike against Gemini directly, and the T-02b switch to the Vercel AI Gateway. The gateway section is current; the Gemini section is kept for the record, since it's what motivated the switch.

## 18 November 2026 — Vercel AI Gateway (T-02b)

Run with the committed `pnpm run check:ai` (`scripts/check-ai.ts`), 9 real gateway calls, against the app's real prompts and schemas (`src/server/ai/prompts/topics.ts`, `quiz.ts`) on synthetic text. All 9 checks passed. Total cost under US$0.001 (the three calls that reported a cost in their routing metadata came to about US$0.00064; the gateway doesn't return a cost for the Google embedding calls or the two check-model calls in this SDK version).

| Item | Value |
| --- | --- |
| SDK | `ai` 6.0.322, `gateway` import built in (no `@ai-sdk/gateway` dependency) |
| Generate model | `openai/gpt-5-nano` (`AI_MODEL_GENERATE`), reasoning effort `low` |
| Check model | `openai/gpt-5-nano` (`AI_MODEL_CHECK`), reasoning effort `low` |
| Embedding model | `google/gemini-embedding-001` (`AI_MODEL_EMBED`), reached through the gateway, `outputDimensionality: 768` |

| Check | Result |
| --- | --- |
| Forced 1 ms timeout | ✅ Aborted immediately with `error.name === "TimeoutError"` — `callAI()`'s `isTimeoutError()` classifies this as the `TIMEOUT` error code, confirming the per-call time limit (about 120 s in real calls) fails fast instead of hanging |
| Ping (minimal reasoning) | ✅ "OK", 940 ms, 0 reasoning tokens |
| Embedding dimension and norm | ✅ 768 dimensions; raw norm 0.5816 — **not** unit length, so manual L2 normalisation is still required |
| L2 normalisation | ✅ Norm 1.000000 on all four document vectors |
| Retrieval sanity | ✅ The "keys" query scored the keys page (p2) highest: cosine 0.652, **0.804**, 0.631, 0.659 |
| Real topic prompt (reasoning `low`) | ✅ Passed `checkSuggestions`: 6 topics; 11.3 s; 304 input / 818 output tokens, of which 640 were reasoning |
| Prompt injection inside a `<source>` | ✅ 4 normal topics; nothing obeyed or leaked |
| Real quiz-writing prompt (3 asked) | ✅ 3 questions; all passed the code checks (4 distinct options, valid topic and source labels); 6.7 s; 453 input / 673 output tokens |
| Real answer-check prompt, reasoning `low` | ✅ All 3 `supported` and `exactlyOneCorrect`; 4.5 s; 461 input / 410 output tokens, of which 256 were reasoning |
| Same answer-check prompt, reasoning `minimal` | ✅ Same 3 results; 2.1 s; 461 input / 135 output tokens, **0** reasoning tokens |

Other observations:

- **`minimal` reasoning looked just as good as `low` for the check, on this single synthetic sample**: same verdicts, under half the latency (2.1 s vs 4.5 s) and no reasoning tokens at all. This is one small sample, not the AI evaluation (PRD Section 3); it's a reason to try `minimal` for `AI_MODEL_CHECK` once real lecture data is available (T-09b or the evaluation), not yet a decision to switch. `REASONING_EFFORT.check` in `src/server/ai/call-ai.ts` stays `low` until that's confirmed.
- The gateway's routing metadata reports `fallbacksAvailable: ["azure"]` for `gpt-5-nano`, so it can route the same model to Azure when OpenAI is busy. It also reports a per-call cost for OpenAI calls, but not for the Google embedding calls or (in this SDK version) the check-model calls — `pnpm run report:ai-usage`'s own dated price constants cover the gap.
- Reasoning tokens were about 78% of output tokens on the topic prompt at `low` (640 of 818).

### What this means for later tasks

- **Reliability is much better than the Gemini free tier** (compare the 13 November results below): no 429/503s in this run, and the gateway's own fallback (Azure) is available if OpenAI is busy. T-08b and T-11b's retry/backoff logic stays in place regardless, since any external call can still fail.
- **`gpt-5-nano` quality on real lectures is still unknown.** This test used short synthetic text; T-09b's first real runs and the AI evaluation (PRD Section 3) decide whether to upgrade to `gpt-5.4-nano` or `gpt-5-mini`.
- **Embeddings are unchanged**: still `gemini-embedding-001`, still 768-D, still need manual L2 normalisation. Only the connection changed, so old dev-database chunks stored with the bare model name `gemini-embedding-001` stop matching retrieval against new chunks stored as `google/gemini-embedding-001`. Acceptable because only test data exists in the dev database.
- **Cost:** well within the gateway's US$5 / 30-day free credit at this scale. `pnpm run report:ai-usage` tracks real spend from the `ai_calls` table once the app is making real calls (from T-09b onward).

## 13 November 2026 — Gemini (direct, free tier), superseded by T-02b

Synthetic text only, against the developer's own Gemini dev key (free tier). Measured over three runs. Each burst was 10 parallel requests, started in a fresh minute.

### Setup verified

| Item | Value |
| --- | --- |
| SDK | `ai` 6.0.322, `@ai-sdk/google` 3.0.141 |
| Generate model | `gemini-3.5-flash` (`AI_MODEL_GENERATE`) |
| Check model | `gemini-3.5-flash-lite` (`AI_MODEL_CHECK`) |
| Embedding model | `gemini-embedding-001` (`AI_MODEL_EMBED`), `outputDimensionality: 768` |
| Structured output | `generateText({ output: Output.object({ schema }) })` works on both chat models; `generateObject` isn't used |

### Results

| Check | Result |
| --- | --- |
| Structured topics (generate model) | ✅ Passes Zod and the domain checks: 3–12 topics, real page numbers, no duplicate names. 4 topics; about 180 input and 680–820 output tokens; 6–14 s. |
| Prompt injection inside a `<source>` | ✅ Normal topics. The model didn't obey "Ignore all previous instructions…" and didn't leak the system prompt. |
| Answer check (check model) | ✅ Structured `{ supported, exactlyOneCorrect, reason }`, correct verdict. About 130 input and 50 output tokens; 1.1–1.6 s. |
| Embedding dimension | ✅ 768. |
| Raw norm | ✅ **0.58**, so the 768-D vector is **not** unit length. Manual L2 normalisation is required, as the PRD says. |
| After `l2Normalize` | ✅ Norm 1.000000. |
| Retrieval sanity | ✅ The "Primary and foreign keys" query, using `RETRIEVAL_QUERY`, is closest to the keys page: cosine 0.79, against 0.64–0.66 for the other pages, which use `RETRIEVAL_DOCUMENT`. |
| One embedding step of 50 chunks | ✅ One provider request (the SDK sends up to 100 per request), about 2 s. Gemini doesn't report embedding token usage. |

### Observed rate limits and latency (free tier)

| Model | 10 parallel requests | Latency of successful requests |
| --- | --- | --- |
| `gemini-3.5-flash-lite` (check) | 10/10 ok | p50 about 1.1–1.2 s, p95 about 1.4–2.0 s |
| `gemini-3.5-flash` (generate) | **5–8/10 ok**; the rest got 429 "You exceeded your current quota" or 503 "high demand" | p50 about 2–15 s, p95 about 2.6–68 s |
| `gemini-embedding-001` | 10/10 ok | p50 about 0.45–0.57 s, p95 about 0.5–0.8 s |

These are observations from a small account on one day, not published allowances. The per-minute quota on the generate model was reached after only a handful of calls. Calls in the minute before a burst counted against it, and a run started straight after another got an immediate 429.

### What this meant for later tasks (at the time)

- **T-08b (topics) and T-11b (quizzes): the generate model is the bottleneck.**
  - Plan for a low per-minute allowance and occasional 503s.
  - Use the PRD's single retry budget, with delayed QStash deliveries and Retry-After, rather than in-process sleeps or SDK retries. This matters because a single call can take over a minute under load.
  - Keep generation calls few and bounded, per the two-job concurrency cap.
- **Embeddings are fast and weren't limited** at this scale. 50-chunk steps of about 2 s each fit well inside a function timeout.
- **Always normalise embeddings** with `embedTexts()` in `src/server/ai/ai-embeddings.ts`, and store `gemini-embedding-001` plus 768 with each chunk. Never mix in vectors from another model.
- **Gemini doesn't return embedding token counts,** so the `ai_calls` log should record them as null, or estimate them.
- **Before evaluation or a demo,** check the real daily (RPD) limit in AI Studio. This test only measured per-minute behaviour.

### Not covered here

- The `callAI()` wrapper, the `ai_calls` table, `src/server/ai/prompts/*` and the fake provider are built in T-08b and T-11b, where the real prompts are. This spike's prompts are inline test prompts, not versioned production prompts.
- Large inputs (token budget for a 240,000-character document) are measured with real documents in T-08b.
