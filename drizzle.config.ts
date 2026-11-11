import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { withVerifyFullSslMode } from "./src/server/db/db-connection-url";

// Next.js loads .env.local itself at runtime, but Drizzle Kit is a plain
// CLI and only reads process.env, so load it explicitly here.
config({ path: ".env.local" });

// Migrations run outside connection pooling, against the unpooled URL
// (PRD Section 4: "Database connection"; Section 5 risk note for T-01a).
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is required to run Drizzle Kit. Check .env.local against the Environment variables table in docs/prd/04-architecture-database.md.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    // Explicit `sslmode=verify-full`, same as the app (issue #8).
    url: withVerifyFullSslMode(databaseUrl),
  },
});
