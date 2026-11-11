#!/usr/bin/env tsx
/**
 * Verifies the T-05 Study Spaces API end to end, against the real dev
 * database: ownership, the stable error shape and the 1-150 character
 * name rule, including the database's own CHECK constraint. Built like
 * `check-auth.ts` — a test-only auth instance creates two real users and
 * sessions directly, then the actual route handlers
 * (`src/app/api/spaces/**`) are called exactly as Next.js would call
 * them, against the production `getAuth()`/`db` instances.
 *
 * Prints only pass/fail and short, safe messages. Removes only the two
 * users it creates; their `study_spaces` rows (including the
 * soft-deleted one from the delete test) are removed by the FK's
 * `onDelete: "cascade"` when the owning user is deleted.
 *
 * Run with: pnpm run check:spaces
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import { db } from "../src/server/db/db-client";
import { studySpaces } from "../src/server/db/schema";
import { DELETE, PATCH } from "../src/app/api/spaces/[spaceId]/route";
import { GET, POST } from "../src/app/api/spaces/route";

type CheckResult = { name: string; ok: boolean; message: string };
type ErrorBody = { error?: { code?: string; message?: string } };
type Space = { id: string; name: string; createdAt: string; updatedAt: string };

const BASE_URL = "http://localhost:3000";
const results: CheckResult[] = [];

function check(name: string, ok: boolean, message: string) {
  results.push({ name, ok, message });
}

/** Strips anything that could resemble a secret/token before printing it. */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}

function hasOnlyPublicFields(space: Record<string, unknown>): boolean {
  const keys = Object.keys(space).sort();
  return JSON.stringify(keys) === JSON.stringify(["createdAt", "id", "name", "updatedAt"]);
}

const RANDOM_MISSING_ID = "00000000-0000-4000-8000-000000000000";
const MALFORMED_ID = "not-a-uuid";
const EXPECTED_NOT_FOUND_BODY = JSON.stringify({
  error: { code: "SPACE_NOT_FOUND", message: "Study space not found." },
});

async function main() {
  const testAuth = buildTestAuth();
  const ctx = await testAuth.$context;
  const test = ctx.test;
  const stamp = Date.now();

  function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set("content-type", "application/json");
    if (cookie) headers.set("cookie", cookie);
    return new Request(`${BASE_URL}${path}`, { ...rest, headers });
  }

  function spaceRequest(spaceId: string, init: RequestInit & { cookie?: string } = {}) {
    return request(`/api/spaces/${spaceId}`, init);
  }

  async function createUserSession(label: string) {
    const user = test.createUser({
      email: `check-spaces-${label}-${stamp}@example.com`,
      name: `Check Spaces ${label}`,
      role: "student",
    });
    const savedUser = await test.saveUser(user);
    const { headers: loginHeaders } = await test.login({ userId: savedUser.id });
    return { userId: savedUser.id, cookie: loginHeaders.get("cookie") ?? undefined };
  }

  const userA = await createUserSession("a");
  const userB = await createUserSession("b");
  check("Create two test users", !!userA.userId && !!userB.userId, "created");

  // 1. No session: 401 on all four methods (Security rule 2).
  const unauthedGet = await GET(request("/api/spaces"));
  const unauthedPost = await POST(request("/api/spaces", { method: "POST", body: "{}" }));
  const unauthedPatch = await PATCH(spaceRequest(RANDOM_MISSING_ID, { method: "PATCH", body: "{}" }), {
    params: Promise.resolve({ spaceId: RANDOM_MISSING_ID }),
  });
  const unauthedDelete = await DELETE(spaceRequest(RANDOM_MISSING_ID, { method: "DELETE" }), {
    params: Promise.resolve({ spaceId: RANDOM_MISSING_ID }),
  });
  check(
    "No session: 401 on GET/POST/PATCH/DELETE",
    [unauthedGet, unauthedPost, unauthedPatch, unauthedDelete].every((r) => r.status === 401),
    `statuses ${[unauthedGet, unauthedPost, unauthedPatch, unauthedDelete].map((r) => r.status).join(", ")}`,
  );

  // 2. Name validation: empty, whitespace-only and 151 chars all 400;
  // exactly 150 chars works; names are trimmed; a stray ownerId is
  // ignored (Security rule 1).
  async function createAs(cookie: string | undefined, body: unknown) {
    const response = await POST(
      request("/api/spaces", { method: "POST", cookie, body: JSON.stringify(body) }),
    );
    return { status: response.status, body: (await response.json()) as ErrorBody & { space?: Space } };
  }

  const emptyNameRes = await createAs(userA.cookie, { name: "" });
  check(
    "Empty name -> 400",
    emptyNameRes.status === 400 && emptyNameRes.body.error?.code === "VALIDATION_ERROR",
    `status ${emptyNameRes.status}, message "${emptyNameRes.body.error?.message}"`,
  );

  const whitespaceNameRes = await createAs(userA.cookie, { name: "   " });
  check(
    "Whitespace-only name -> 400",
    whitespaceNameRes.status === 400 && whitespaceNameRes.body.error?.code === "VALIDATION_ERROR",
    `status ${whitespaceNameRes.status}`,
  );

  const tooLongNameRes = await createAs(userA.cookie, { name: "a".repeat(151) });
  check(
    "151-character name -> 400",
    tooLongNameRes.status === 400 && tooLongNameRes.body.error?.code === "VALIDATION_ERROR",
    `status ${tooLongNameRes.status}, message "${tooLongNameRes.body.error?.message}"`,
  );

  const maxLengthNameRes = await createAs(userA.cookie, { name: "b".repeat(150) });
  check(
    "150-character name -> 201",
    maxLengthNameRes.status === 201 && maxLengthNameRes.body.space?.name.length === 150,
    `status ${maxLengthNameRes.status}`,
  );

  const trimAndStrayFieldRes = await createAs(userA.cookie, {
    name: "  Database Systems  ",
    ownerId: userB.userId,
  });
  const createdSpace = trimAndStrayFieldRes.body.space;
  check(
    "Create trims the name, ignores a stray ownerId, and returns only public fields",
    trimAndStrayFieldRes.status === 201 &&
      createdSpace?.name === "Database Systems" &&
      hasOnlyPublicFields(createdSpace as unknown as Record<string, unknown>),
    `status ${trimAndStrayFieldRes.status}, name "${createdSpace?.name}", keys ${Object.keys(createdSpace ?? {}).join(",")}`,
  );

  if (!createdSpace) {
    check("Remaining checks", false, "no space was created; aborting");
    await printAndExit();
    return;
  }

  // 3. List: owner only, newest first (not asserted on order here), only
  // public fields.
  const listAsA = await GET(request("/api/spaces", { cookie: userA.cookie }));
  const listAsABody = (await listAsA.json()) as { spaces: Space[] };
  check(
    "List as owner includes the created space",
    listAsA.status === 200 && listAsABody.spaces.some((s) => s.id === createdSpace.id),
    `status ${listAsA.status}, count ${listAsABody.spaces.length}`,
  );

  const listAsB = await GET(request("/api/spaces", { cookie: userB.cookie }));
  const listAsBBody = (await listAsB.json()) as { spaces: Space[] };
  check(
    "Student B's list never includes Student A's space",
    listAsB.status === 200 && !listAsBBody.spaces.some((s) => s.id === createdSpace.id),
    `status ${listAsB.status}, count ${listAsBBody.spaces.length}`,
  );

  // 4. Cross-owner rename/delete: identical 404, A's space unchanged.
  async function patchAs(cookie: string | undefined, spaceId: string, body: unknown) {
    const response = await PATCH(
      spaceRequest(spaceId, { method: "PATCH", cookie, body: JSON.stringify(body) }),
      { params: Promise.resolve({ spaceId }) },
    );
    return { status: response.status, text: await response.text() };
  }

  async function deleteAs(cookie: string | undefined, spaceId: string) {
    const response = await DELETE(spaceRequest(spaceId, { method: "DELETE", cookie }), {
      params: Promise.resolve({ spaceId }),
    });
    return response;
  }

  const bRenamesARes = await patchAs(userB.cookie, createdSpace.id, { name: "Hijacked" });
  check(
    "Student B renaming Student A's space -> 404",
    bRenamesARes.status === 404 && bRenamesARes.text === EXPECTED_NOT_FOUND_BODY,
    `status ${bRenamesARes.status}`,
  );

  const bDeletesARes = await deleteAs(userB.cookie, createdSpace.id);
  check("Student B deleting Student A's space -> 404", bDeletesARes.status === 404, `status ${bDeletesARes.status}`);

  const unchangedListAsA = await GET(request("/api/spaces", { cookie: userA.cookie }));
  const unchangedListAsABody = (await unchangedListAsA.json()) as { spaces: Space[] };
  check(
    "A's space is unchanged after B's attempts",
    unchangedListAsABody.spaces.some((s) => s.id === createdSpace.id && s.name === "Database Systems"),
    "name still 'Database Systems'",
  );

  // 5. Missing and malformed IDs give the identical 404 as someone
  // else's ID.
  const missingIdRes = await patchAs(userA.cookie, RANDOM_MISSING_ID, { name: "x" });
  const malformedIdRes = await patchAs(userA.cookie, MALFORMED_ID, { name: "x" });
  check(
    "Missing and malformed IDs give the identical 404 body",
    missingIdRes.status === 404 &&
      missingIdRes.text === EXPECTED_NOT_FOUND_BODY &&
      malformedIdRes.status === 404 &&
      malformedIdRes.text === EXPECTED_NOT_FOUND_BODY,
    `missing: ${missingIdRes.status}, malformed: ${malformedIdRes.status}`,
  );

  // 6. The owner renames their own space.
  const renameRes = await patchAs(userA.cookie, createdSpace.id, { name: "  Renamed Space  " });
  const renameBody = JSON.parse(renameRes.text) as { space?: Space };
  check(
    "Owner renames their own space",
    renameRes.status === 200 && renameBody.space?.name === "Renamed Space",
    `status ${renameRes.status}, name "${renameBody.space?.name}"`,
  );

  // 7. Delete: 204, then gone from the list, a second PATCH/DELETE give
  // 404, and the row still exists with deleted_at set (soft delete).
  const deleteRes = await deleteAs(userA.cookie, createdSpace.id);
  check("Owner deletes their own space -> 204", deleteRes.status === 204, `status ${deleteRes.status}`);

  const listAfterDelete = await GET(request("/api/spaces", { cookie: userA.cookie }));
  const listAfterDeleteBody = (await listAfterDelete.json()) as { spaces: Space[] };
  check(
    "Deleted space is gone from the list",
    !listAfterDeleteBody.spaces.some((s) => s.id === createdSpace.id),
    `count ${listAfterDeleteBody.spaces.length}`,
  );

  const patchAfterDeleteRes = await patchAs(userA.cookie, createdSpace.id, { name: "Again" });
  const secondDeleteRes = await deleteAs(userA.cookie, createdSpace.id);
  check(
    "PATCH and a second DELETE on a deleted space both give 404",
    patchAfterDeleteRes.status === 404 && secondDeleteRes.status === 404,
    `PATCH: ${patchAfterDeleteRes.status}, DELETE: ${secondDeleteRes.status}`,
  );

  const [rowAfterDelete] = await db
    .select()
    .from(studySpaces)
    .where(eq(studySpaces.id, createdSpace.id));
  check(
    "The row still exists in the database with deleted_at set",
    !!rowAfterDelete && rowAfterDelete.deletedAt !== null,
    rowAfterDelete ? `deletedAt: ${rowAfterDelete.deletedAt}` : "row missing",
  );

  // 8. The database's own CHECK constraint rejects a direct insert that
  // bypasses the Zod schema entirely.
  let constraintRejected = false;
  try {
    await db.insert(studySpaces).values({ ownerId: userA.userId, name: "c".repeat(151) });
  } catch {
    constraintRejected = true;
  }
  check(
    "Database CHECK constraint rejects a 151-character name on direct insert",
    constraintRejected,
    constraintRejected ? "insert rejected" : "insert succeeded (constraint missing)",
  );

  // Cleanup: the two users this run created. Their study_spaces rows
  // (including the soft-deleted one above) cascade-delete with them.
  await test.deleteUser(userA.userId);
  await test.deleteUser(userB.userId);
  check("Cleanup", true, "removed the two test users and their spaces");

  await printAndExit();
}

async function printAndExit() {
  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.message}`);
  }
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("check:spaces crashed:", safeMessage(error));
  process.exitCode = 1;
});
