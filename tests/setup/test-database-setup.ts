import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll } from "vitest";

config({ path: ".env.local", quiet: true });

// No app imports above this point: serverEnv() caches its first read.
const target = process.env.DATABASE_URL_TEST;
if (!target) throw new Error("DATABASE_URL_TEST is required. Tests never fall back to DATABASE_URL.");

function databaseIdentity(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid database URL (value withheld)."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname === "/") {
    throw new Error("A PostgreSQL URL with an explicit test database is required.");
  }
  // Neon pooled and direct hostnames address the same database.
  return `${url.hostname.replace(/-pooler(?=\.)/, "")}:${url.port || "5432"}${url.pathname}`;
}

const identity = databaseIdentity(target);
for (const existing of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
  if (existing && databaseIdentity(existing) === identity) {
    throw new Error("DATABASE_URL_TEST must identify a separate database from the app database.");
  }
}
if (process.env.VERCEL_ENV === "production") throw new Error("Integration tests refuse to run in Production.");

const testUrl = target.replace(/([?&])sslmode=(?:prefer|require|verify-ca)(?=&|#|$)/, "$1sslmode=verify-full");
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_URL_UNPOOLED = testUrl;
process.env.DATABASE_URL_TEST = testUrl;
// These tests never contact OAuth, Blob, QStash or AI. Use local-only settings,
// so running them requires only a dedicated database, not real service keys.
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
process.env.GOOGLE_OAUTH_CLIENT_ID = "integration-test-client";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "integration-test-secret";
process.env.AI_PROVIDER = "fake";
for (const key of ["BLOB_READ_WRITE_TOKEN", "QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY", "AI_MODEL_GENERATE", "AI_MODEL_CHECK", "AI_MODEL_EMBED"]) {
  process.env[key] = "integration-test-unused";
}
for (const key of ["VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "OAUTH_PROXY_SECRET"]) delete process.env[key];

const migrationPool = new Pool({ connectionString: testUrl, connectionTimeoutMillis: 10_000 });
try {
  await migrate(drizzle(migrationPool), { migrationsFolder: resolve("drizzle") });
} catch {
  throw new Error("Test database migration failed. Check DATABASE_URL_TEST connectivity and pgvector permissions (details withheld to protect credentials).");
} finally {
  await migrationPool.end();
}

afterAll(async () => {
  await global.__dbPool?.end();
  global.__dbPool = undefined;
  global.__db = undefined;
  global.__auth = undefined;
});
