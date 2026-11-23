import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { studySpaces } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import { requireUser } from "@/server/auth/auth-session";
import { toErrorResponse } from "@/lib/api-errors";
import { GET, POST } from "@/app/api/spaces/route";
import { PATCH, DELETE } from "@/app/api/spaces/[spaceId]/route";
import { createTestStudents, studentRequest } from "../helpers/auth-test-students";

const notFound = { error: { code: "SPACE_NOT_FOUND", message: "Study space not found." } };

describe("T-07b Study Space isolation (provisional T-07a IDs)", () => {
  let students: Awaited<ReturnType<typeof createTestStudents>>;
  let spaceId: string;
  const name = "Private synthetic security space";
  beforeEach(async () => {
    students = await createTestStudents();
    const response = await POST(studentRequest("/api/spaces", "POST", students.a.cookie, { name }));
    expect(response.status).toBe(201);
    spaceId = (await response.json()).space.id;
  });
  afterEach(async () => { await students?.cleanup(); });
  const context = (id: string) => ({ params: Promise.resolve({ spaceId: id }) });
  const change = (id: string, cookie: string, method: "PATCH" | "DELETE", body = { name: "Hijacked" }) =>
    (method === "PATCH" ? PATCH : DELETE)(studentRequest(`/api/spaces/${id}`, method, cookie, method === "PATCH" ? body : undefined), context(id));

  it("SEC-SPACE-01: each list contains only its owner's spaces", async () => {
    for (const [person, expected] of [[students.a, true], [students.b, false]] as const) {
      const response = await GET(studentRequest("/api/spaces", "GET", person.cookie));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.spaces.some((space: { id: string }) => space.id === spaceId)).toBe(expected);
      if (!expected) expect(JSON.stringify(body)).not.toContain(name);
    }
  });

  it("SEC-SPACE-02: B cannot rename or delete A's space, and the row is unchanged", async () => {
    const [before] = await db.select().from(studySpaces).where(eq(studySpaces.id, spaceId));
    for (const method of ["PATCH", "DELETE"] as const) {
      const response = await change(spaceId, students.b.cookie, method);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
    const [after] = await db.select().from(studySpaces).where(eq(studySpaces.id, spaceId));
    expect(after).toEqual(before);
  });

  it("SEC-SPACE-03: absent, malformed, deleted and foreign IDs have identical 404 bodies", async () => {
    const deleted = await POST(studentRequest("/api/spaces", "POST", students.b.cookie, { name: "To delete" }));
    const deletedId = (await deleted.json()).space.id;
    expect((await change(deletedId, students.b.cookie, "DELETE")).status).toBe(204);
    const viewer = await requireUser(studentRequest("/api/spaces", "GET", students.b.cookie));
    for (const id of [randomUUID(), "not-a-uuid", "", deletedId, spaceId]) {
      for (const method of ["PATCH", "DELETE"] as const) {
        const response = await change(id, students.b.cookie, method);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(notFound);
      }
      try {
        await requireSpace(id, viewer);
        expect.fail("requireSpace accepted an inaccessible ID");
      } catch (error) {
        const response = toErrorResponse(error);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(notFound);
      }
    }
  });

  it("SEC-SPACE-04: ownerId, userId and role in the body cannot change ownership", async () => {
    const forged = { name: "Client fields ignored", ownerId: students.b.user.id, userId: students.b.user.id, role: "admin" };
    const response = await POST(studentRequest("/api/spaces", "POST", students.a.cookie, forged));
    expect(response.status).toBe(201);
    const { space } = await response.json();
    expect(Object.keys(space).sort()).toEqual(["createdAt", "id", "name", "updatedAt"]);
    const renamed = await PATCH(studentRequest(`/api/spaces/${space.id}`, "PATCH", students.a.cookie, forged), context(space.id));
    expect(renamed.status).toBe(200);
    const [row] = await db.select().from(studySpaces).where(eq(studySpaces.id, space.id));
    expect(row.ownerId).toBe(students.a.user.id);
    const bList = await GET(studentRequest("/api/spaces", "GET", students.b.cookie));
    expect((await bList.json()).spaces).toEqual([]);
    const current = await requireUser(studentRequest("/api/spaces", "GET", students.a.cookie));
    expect(current.id).toBe(students.a.user.id);
    expect(current.role).toBe("student");
  });

  it("SEC-SPACE-05: deletion blocks access immediately and retains a soft-deleted row", async () => {
    expect((await change(spaceId, students.a.cookie, "PATCH", { name: "Owner rename" })).status).toBe(200);
    expect((await change(spaceId, students.a.cookie, "DELETE")).status).toBe(204);
    const list = await GET(studentRequest("/api/spaces", "GET", students.a.cookie));
    expect((await list.json()).spaces).toEqual([]);
    for (const method of ["PATCH", "DELETE"] as const) {
      const response = await change(spaceId, students.a.cookie, method);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
    const [row] = await db.select().from(studySpaces).where(eq(studySpaces.id, spaceId));
    expect(row.deletedAt).toBeInstanceOf(Date);
    const viewer = await requireUser(studentRequest("/api/spaces", "GET", students.a.cookie));
    await expect(requireSpace(spaceId, viewer)).rejects.toMatchObject({ code: "SPACE_NOT_FOUND", status: 404 });
  });
});
