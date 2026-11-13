# T-02 AI smoke test results

Run with `pnpm run check:ai` (`scripts/check-ai.ts`). Synthetic text only, against the developer's own Gemini dev key (free tier). Measured on 13 November 2026, over three runs. Each burst was 10 parallel requests, started in a fresh minute.

## Setup verified

| Item | Value |
| --- | --- |
| SDK | `ai` 6.0.322, `@ai-sdk/google` 3.0.141 |
| Generate model | `gemini-3.5-flash` (`AI_MODEL_GENERATE`) |
| Check model | `gemini-3.5-flash-lite` (`AI_MODEL_CHECK`) |
| Embedding model | `gemini-embedding-001` (`AI_MODEL_EMBED`), `outputDimensionality: 768` |
| Structured output | `generateText({ output: Output.object({ schema }) })` works on both chat models; `generateObject` isn't used |

## Results

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

## Observed rate limits and latency (free tier)

| Model | 10 parallel requests | Latency of successful requests |
| --- | --- | --- |
| `gemini-3.5-flash-lite` (check) | 10/10 ok | p50 about 1.1–1.2 s, p95 about 1.4–2.0 s |
| `gemini-3.5-flash` (generate) | **5–8/10 ok**; the rest got 429 "You exceeded your current quota" or 503 "high demand" | p50 about 2–15 s, p95 about 2.6–68 s |
| `gemini-embedding-001` | 10/10 ok | p50 about 0.45–0.57 s, p95 about 0.5–0.8 s |

These are observations from a small account on one day, not published allowances. The per-minute quota on the generate model was reached after only a handful of calls. Calls in the minute before a burst counted against it, and a run started straight after another got an immediate 429.

## What this means for later tasks

- **T-08b (topics) and T-11b (quizzes): the generate model is the bottleneck.**
  - Plan for a low per-minute allowance and occasional 503s.
  - Use the PRD's single retry budget, with delayed QStash deliveries and Retry-After, rather than in-process sleeps or SDK retries. This matters because a single call can take over a minute under load.
  - Keep generation calls few and bounded, per the two-job concurrency cap.
- **Embeddings are fast and weren't limited** at this scale. 50-chunk steps of about 2 s each fit well inside a function timeout.
- **Always normalise embeddings** with `embedTexts()` in `src/server/ai/ai-embeddings.ts`, and store `gemini-embedding-001` plus 768 with each chunk. Never mix in vectors from another model.
- **Gemini doesn't return embedding token counts,** so the `ai_calls` log should record them as null, or estimate them.
- **Before evaluation or a demo,** check the real daily (RPD) limit in AI Studio. This test only measured per-minute behaviour.

## Not covered here

- The `callAI()` wrapper, the `ai_calls` table, `src/server/ai/prompts/*` and the fake provider are built in T-08b and T-11b, where the real prompts are. This spike's prompts are inline test prompts, not versioned production prompts.
- Large inputs (token budget for a 240,000-character document) are measured with real documents in T-08b.
