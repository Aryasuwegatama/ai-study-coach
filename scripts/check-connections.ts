#!/usr/bin/env tsx
/**
 * Verifies the T-01a infrastructure is actually reachable: database (query
 * + transaction + pgvector), Private Blob, QStash and Gemini. Prints only
 * pass/fail and short, safe messages — never a secret value.
 *
 * Run with: pnpm run check:connections
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Client as QStashClient } from "@upstash/qstash";
import { generateText } from "ai";
import { serverEnv } from "../src/lib/env";
import { putPrivateBlob, deleteBlob } from "../src/server/storage/client";
import { checkModel } from "../src/server/ai/client";

type CheckResult = { name: string; ok: boolean; message: string };

async function checkDatabase(): Promise<CheckResult> {
  const pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      await client.query("BEGIN");
      await client.query("SELECT 1");
      await client.query("COMMIT");
      const ext = await client.query(
        "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
      );
      if (ext.rowCount === 0) {
        return {
          name: "Database",
          ok: false,
          message: "Connected, but pgvector is not enabled. Run: pnpm run db:migrate",
        };
      }
      return { name: "Database", ok: true, message: "Query, transaction and pgvector OK" };
    } finally {
      client.release();
    }
  } catch (error) {
    return { name: "Database", ok: false, message: safeMessage(error) };
  } finally {
    await pool.end();
  }
}

async function checkBlob(): Promise<CheckResult> {
  const pathname = `_connection-check/${randomUUID()}.txt`;
  try {
    const blob = await putPrivateBlob(pathname, "connection check", "text/plain");
    await deleteBlob(blob.url);
    return { name: "Blob", ok: true, message: "Put and delete OK" };
  } catch (error) {
    return { name: "Blob", ok: false, message: safeMessage(error) };
  }
}

async function checkQStash(): Promise<CheckResult> {
  try {
    const client = new QStashClient({ token: serverEnv().QSTASH_TOKEN });
    // A harmless read-only call: lists dead-letter messages (usually none).
    // Confirms the token is accepted without publishing anything.
    await client.dlq.listMessages({ count: 1 });
    return { name: "QStash", ok: true, message: "Credentials accepted" };
  } catch (error) {
    return { name: "QStash", ok: false, message: safeMessage(error) };
  }
}

async function checkGemini(): Promise<CheckResult> {
  try {
    const { text } = await generateText({
      model: checkModel(),
      prompt: "Reply with the single word: OK",
    });
    return {
      name: "Gemini",
      ok: text.trim().length > 0,
      message: text.trim().length > 0 ? "Request succeeded" : "Empty response",
    };
  } catch (error) {
    return { name: "Gemini", ok: false, message: safeMessage(error) };
  }
}

/** Strips anything that could resemble a secret from an error before printing it. */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}

async function main() {
  const results = await Promise.all([
    checkDatabase(),
    checkBlob(),
    checkQStash(),
    checkGemini(),
  ]);

  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.message}`);
  }

  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main();
