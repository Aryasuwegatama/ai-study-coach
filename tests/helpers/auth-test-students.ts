import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { buildTestAuth } from "@/server/auth/auth-test-instance";
import { db } from "@/server/db/db-client";
import { rateLimit, user } from "@/server/db/schema";

export const TEST_ORIGIN = "http://localhost:3000";

export async function createTestStudents() {
  const auth = buildTestAuth();
  const { test } = await auth.$context;
  const userIds: string[] = [];
  const rateKeys = new Set<string>();
  const run = randomUUID();
  let requestNumber = 0;

  async function cleanup() {
    // Exact IDs only; user FKs cascade to sessions and spaces, including soft deletes.
    if (userIds.length) await db.delete(user).where(inArray(user.id, userIds));
    for (const key of rateKeys) await db.delete(rateLimit).where(eq(rateLimit.key, key));
  }
  async function student(label: string) {
    const saved = await test.saveUser(test.createUser({
      email: `security-${label}-${run}@example.com`, name: `Security Student ${label}`, role: "student",
    }));
    userIds.push(saved.id);
    const login = await test.login({ userId: saved.id });
    const cookie = login.headers.get("cookie");
    if (!cookie) throw new Error("Test session creation returned no cookie.");
    return { user: saved, cookie, cookies: login.cookies };
  }
  function authRequest(path: string, body: unknown, cookie?: string) {
    // Unique, synthetic IPv6 addresses keep each request out of another's bucket.
    // Better Auth normalises IPv6 to a full /64 address before keying it.
    const subnet = (parseInt(run.slice(4, 8), 16) + ++requestNumber) % 65536;
    const ip = `2001:0db8:${run.slice(0, 4)}:${subnet.toString(16).padStart(4, "0")}:0000:0000:0000:0000`;
    rateKeys.add(`${ip}|${path}`);
    return auth.handler(new Request(`${TEST_ORIGIN}/api/auth${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: TEST_ORIGIN, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }));
  }
  try {
    return { a: await student("A"), b: await student("B"), auth, authRequest, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function studentRequest(path: string, method = "GET", cookie?: string, body?: unknown) {
  return new Request(`${TEST_ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
