import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { session } from "@/server/db/schema";
import { requireUser } from "@/server/auth/auth-session";
import {
  createTestStudents,
  studentRequest,
} from "../helpers/auth-test-students";
import {
  studentApiCases,
  studentApiPaths,
} from "../helpers/student-api-routes";

describe("T-07b auth and sessions (provisional T-07a IDs)", () => {
  let students: Awaited<ReturnType<typeof createTestStudents>>;
  beforeEach(async () => {
    students = await createTestStudents();
  });
  afterEach(async () => {
    await students?.cleanup();
  });

  it("SEC-AUTH-01: real sessions resolve each student's own identity", async () => {
    for (const person of [students.a, students.b]) {
      const result = await requireUser(
        studentRequest("/api/spaces", "GET", person.cookie),
      );
      expect(result.id).toBe(person.user.id);
      expect(result.role).toBe("student");
    }
  });

  it.each(["missing", "forged", "expired", "signed-out"] as const)(
    "SEC-AUTH-02: %s session receives identical 401 on every student API method",
    async (kind) => {
      let cookie: string | undefined = students.a.cookie;
      if (kind === "missing") cookie = undefined;
      if (kind === "forged") {
        const name = students.a.cookie.slice(0, students.a.cookie.indexOf("="));
        cookie = `${name}=forged.invalid-signature`;
      }
      if (kind === "expired") {
        await db
          .update(session)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(session.userId, students.a.user.id));
      }
      if (kind === "signed-out") {
        // Warm session lookup before revocation as well.
        await requireUser(studentRequest("/api/spaces", "GET", cookie));
        const response = await students.authRequest("/sign-out", {}, cookie);
        expect(response.status).toBe(200);
      }
      for (const route of await studentApiCases()) {
        const response = await route.call(cookie);
        expect(response.status, route.name).toBe(401);
        expect(await response.json(), route.name).toEqual({
          error: { code: "UNAUTHORIZED", message: "Sign in required." },
        });
      }
    },
  );

  it("SEC-AUTH-03: email/password registration and sign-in are disabled", async () => {
    for (const [path, code] of [
      ["/sign-up/email", "EMAIL_PASSWORD_SIGN_UP_DISABLED"],
      ["/sign-in/email", "EMAIL_PASSWORD_DISABLED"],
    ]) {
      const response = await students.authRequest(path, {
        email: students.a.user.email,
        password: "Synthetic-password-123!",
        name: "Synthetic",
      });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe(code);
    }
  });

  it("SEC-AUTH-04: client role cannot elevate privileges or switch identity", async () => {
    const response = await students.authRequest(
      "/update-user",
      { role: "admin", userId: students.b.user.id },
      students.a.cookie,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("FIELD_NOT_ALLOWED");
    const current = await requireUser(
      studentRequest("/api/spaces", "GET", students.a.cookie),
    );
    expect(current.id).toBe(students.a.user.id);
    expect(current.role).toBe("student");
    const userIdOnly = await students.authRequest(
      "/update-user",
      { name: "Synthetic own profile update", userId: students.b.user.id },
      students.a.cookie,
    );
    expect(userIdOnly.status).toBe(200);
    const after = await requireUser(
      studentRequest("/api/spaces", "GET", students.a.cookie),
    );
    expect(after.id).toBe(students.a.user.id);
    expect(after.name).toBe("Synthetic own profile update");
    expect(
      (
        await requireUser(
          studentRequest("/api/spaces", "GET", students.b.cookie),
        )
      ).name,
    ).toBe(students.b.user.name);
  });

  it("SEC-AUTH-05: session cookies are HttpOnly and SameSite", () => {
    const cookie = students.a.cookies[0];
    expect(cookie?.httpOnly).toBe(true);
    expect(["Lax", "Strict"]).toContain(cookie?.sameSite);
  });

  it("SEC-AUTH-06: authentication matrix includes every student API module", () => {
    const root = resolve("src/app/api");
    const actual = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === "route.ts")
      .map((entry) => relative(root, entry.parentPath).split(sep).join("/"))
      .filter((path) => !["auth/[...all]", "jobs/step"].includes(path));
    expect([...studentApiPaths].sort()).toEqual(actual.sort());
  });
});
