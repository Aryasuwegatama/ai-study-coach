#!/usr/bin/env tsx
/**
 * AI usage and cost report (T-02b; PRD Section 3, "Logging" and the AI
 * quality evaluation's "Speed and usage" row): reads the `ai_calls` table
 * and prints, per purpose and model, the call count, p50/p95 latency,
 * token totals and an estimated cost.
 *
 * Prices are this script's own dated constants, not read from the gateway,
 * because `ai_calls` doesn't record a price. Update `PRICES_PER_MILLION_TOKENS`
 * when a model price changes or a new model is added; an unlisted model's
 * cost is reported as "unknown" rather than silently zero.
 *
 * Run with: pnpm run report:ai-usage [--days=30]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { gte } from "drizzle-orm";
import { db } from "../src/server/db/db-client";
import { aiCalls } from "../src/server/db/schema";

/** USD per 1,000,000 tokens, confirmed against the gateway's pricing on 2026-11-18 (issue T-02b). */
const PRICES_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "openai/gpt-5-nano": { input: 0.05, output: 0.4 },
  "openai/gpt-5.4-nano": { input: 0.05, output: 0.4 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  "google/gemini-embedding-001": { input: 0.15, output: 0 },
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES_PER_MILLION_TOKENS[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db.select().from(aiCalls).where(gte(aiCalls.createdAt, since));

  type Group = { purpose: string; model: string; latencies: number[]; inputTokens: number; outputTokens: number; ok: number; invalidOutput: number; error: number };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.purpose}::${row.model}`;
    const group = groups.get(key) ?? { purpose: row.purpose, model: row.model, latencies: [], inputTokens: 0, outputTokens: 0, ok: 0, invalidOutput: 0, error: 0 };
    group.latencies.push(row.latencyMs);
    group.inputTokens += row.inputTokens ?? 0;
    group.outputTokens += row.outputTokens ?? 0;
    if (row.status === "ok") group.ok++;
    else if (row.status === "invalid_output") group.invalidOutput++;
    else group.error++;
    groups.set(key, group);
  }

  if (groups.size === 0) {
    console.log(`No ai_calls rows in the last ${days} day(s).`);
    return;
  }

  console.log(`AI usage over the last ${days} day(s) (${rows.length} calls):\n`);

  let totalCost = 0;
  const totalUnknownCostModels = new Set<string>();
  for (const group of [...groups.values()].sort((a, b) => a.purpose.localeCompare(b.purpose) || a.model.localeCompare(b.model))) {
    const cost = estimateCostUsd(group.model, group.inputTokens, group.outputTokens);
    if (cost === null) totalUnknownCostModels.add(group.model);
    else totalCost += cost;

    console.log(`${group.purpose} — ${group.model}`);
    console.log(`  calls: ${group.latencies.length} (ok ${group.ok}, invalid_output ${group.invalidOutput}, error ${group.error})`);
    console.log(`  latency: p50 ${percentile(group.latencies, 50)} ms, p95 ${percentile(group.latencies, 95)} ms`);
    console.log(`  tokens: in ${group.inputTokens}, out ${group.outputTokens}`);
    console.log(`  estimated cost: ${cost === null ? "unknown (price not in PRICES_PER_MILLION_TOKENS)" : `US$${cost.toFixed(4)}`}`);
    console.log("");
  }

  console.log(`Estimated total cost: US$${totalCost.toFixed(4)}${totalUnknownCostModels.size ? ` (excludes unpriced models: ${[...totalUnknownCostModels].join(", ")})` : ""}`);
  console.log("Never assume guaranteed zero spend; cross-check against Vercel → AI Gateway → Budgets & Spend.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
