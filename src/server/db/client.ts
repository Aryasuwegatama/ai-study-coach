import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Shared Drizzle client. Features never create their own `Pool`; they
 * import `db` from here, per the PRD's "adapters" rule (Section 4).
 *
 * Uses `pg` against the pooled `DATABASE_URL`, which keeps one TCP
 * connection per request/invocation on Vercel's Node.js runtime (not Edge)
 * and gives full, ordinary transaction support — required for quiz
 * submission and revision scheduling (PRD Section 4).
 *
 * Construction is lazy: nothing reads `serverEnv()` or opens a pool until a
 * query actually runs, so merely importing this module (e.g. because
 * `next build` collects route metadata) cannot fail a build over a missing
 * variable in an unrelated environment.
 */
declare global {
  var __dbPool: Pool | undefined;
  var __db: NodePgDatabase<typeof schema> | undefined;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!global.__db) {
    global.__dbPool ??= new Pool({ connectionString: serverEnv().DATABASE_URL });
    global.__db = drizzle(global.__dbPool, { schema });
  }
  return global.__db;
}

export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb() as object, prop, receiver);
    },
  },
);
