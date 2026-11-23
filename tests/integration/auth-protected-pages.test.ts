import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/db-client";
import { studySpaces } from "@/server/db/schema";
import { createTestStudents } from "../helpers/auth-test-students";

// Optional because this exercises a production build, not just route handlers.
// AUTH_PAGE_TESTS=1 requires a current local `pnpm build`; settings and session
// secret are inherited from the same isolated test setup by the child server.
describe.runIf(process.env.AUTH_PAGE_TESTS === "1")(
  "T-07b protected pages over HTTP",
  () => {
    const base = "http://localhost:3110";
    let server: ChildProcess | undefined;
    let students: Awaited<ReturnType<typeof createTestStudents>> | undefined;
    let spaceId: string;
    const canary = `PrivateCanary-${randomUUID()}`;

    beforeAll(async () => {
      if (!existsSync(resolve(".next/BUILD_ID")))
        throw new Error(
          "Build the current app before enabling AUTH_PAGE_TESTS.",
        );
      process.env.BETTER_AUTH_URL = base;
      students = await createTestStudents();
      const [space] = await db
        .insert(studySpaces)
        .values({ ownerId: students.a.user.id, name: canary })
        .returning();
      spaceId = space.id;
      server = spawn(
        process.execPath,
        [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3110"],
        {
          env: { ...process.env, BETTER_AUTH_URL: base },
          stdio: "ignore",
          windowsHide: true,
        },
      );
      let startError = false;
      server.on("error", () => {
        startError = true;
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (startError || server.exitCode !== null)
          throw new Error(
            "The owned test server could not start; check that port 3110 is available.",
          );
        try {
          if ((await fetch(`${base}/privacy`)).ok) return;
        } catch {
          /* server is starting */
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error("Timed out waiting for the local test server.");
    });

    afterAll(async () => {
      try {
        await students?.cleanup();
      } finally {
        server?.kill();
      }
    });

    it("SEC-PAGE-01: signed-out dashboard, spaces and Overview redirect to sign-in", async () => {
      for (const path of [
        "/dashboard",
        "/spaces",
        `/spaces/${spaceId}/overview`,
      ]) {
        const response = await fetch(`${base}${path}`, { redirect: "manual" });
        const body = await response.text();
        const redirected =
          response.headers.get("location")?.endsWith("/sign-in") ||
          body.includes("NEXT_REDIRECT;replace;/sign-in;") ||
          /http-equiv="refresh" content="[^"]*url=\/sign-in"/.test(body);
        expect(redirected, path).toBeTruthy();
        expect(body).not.toContain("PrivateCanary-");
      }
    });

    it("SEC-PAGE-02/03: foreign and deleted Overview responses reveal no name, including streamed metadata", async () => {
      const path = `${base}/spaces/${spaceId}/overview`;
      const owner = await fetch(path, {
        headers: { cookie: students!.a.cookie },
      });
      expect(await owner.text()).toContain(canary); // positive control proves the test is meaningful
      const other = await fetch(path, {
        headers: { cookie: students!.b.cookie },
      });
      const otherBody = await other.text();
      expect(otherBody).toContain("Study space not found");
      expect(otherBody).not.toContain("PrivateCanary-");
      const deleted = await fetch(`${base}/api/spaces/${spaceId}`, {
        method: "DELETE",
        headers: { cookie: students!.a.cookie, origin: base },
      });
      expect(deleted.status).toBe(204);
      const after = await fetch(path, {
        headers: { cookie: students!.a.cookie },
      });
      const afterBody = await after.text();
      expect(afterBody).toContain("Study space not found");
      expect(afterBody).not.toContain("PrivateCanary-");
    });
  },
);
