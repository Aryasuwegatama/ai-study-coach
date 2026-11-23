import {
  materialStorage,
  resetMaterialStorage,
} from "./materials-fake-storage";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { jobs, materials, studySpaces } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import {
  setPublisherForChecks,
  type StepMessage,
} from "@/server/jobs/jobs-client";
import { POST as createRoute } from "@/app/api/spaces/[spaceId]/materials/route";
import { POST as completeRoute } from "@/app/api/materials/[id]/complete/route";
import type { CreateMaterialResponse } from "@/features/materials/materials-schemas";

type SharedStudents = {
  a: { user: SessionUser; cookie: string };
  b: { user: SessionUser; cookie: string };
  cleanup(): Promise<void>;
};

export function materialRequest(
  path: string,
  method = "GET",
  cookie?: string,
  body?: unknown,
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export const materialContext = (id: string) => ({
  params: Promise.resolve({ id }),
});
export const materialSpaceContext = (spaceId: string) => ({
  params: Promise.resolve({ spaceId }),
});

export async function createMaterialsFixture() {
  const sharedHelper = resolve("tests/helpers/auth-test-students.ts");
  if (!existsSync(sharedHelper))
    throw new Error(
      "T-10 requires T-07b's auth-test-students.ts; do not create a second student factory.",
    );
  const shared = await import(/* @vite-ignore */ sharedHelper);
  const students = (await shared.createTestStudents()) as SharedStudents;
  const spaceIds: string[] = [];
  const published: StepMessage[] = [];
  let publishFails = false;
  resetMaterialStorage();
  setPublisherForChecks(async (message) => {
    if (publishFails) throw new Error("Synthetic publish failure");
    published.push({ ...message });
  });
  const cleanup = async () => {
    try {
      if (spaceIds.length)
        await db.delete(jobs).where(inArray(jobs.spaceId, spaceIds));
      await students.cleanup();
    } finally {
      setPublisherForChecks(undefined);
      resetMaterialStorage();
    }
  };
  try {
    async function space(ownerId: string) {
      const [row] = await db
        .insert(studySpaces)
        .values({ ownerId, name: `Synthetic T-10 ${randomUUID()}` })
        .returning();
      spaceIds.push(row.id);
      return row;
    }
    const aSpace = await space(students.a.user.id);
    const aOther = await space(students.a.user.id);
    const bSpace = await space(students.b.user.id);
    async function create(
      name = "synthetic.txt",
      cookie = students.a.cookie,
      spaceId = aSpace.id,
      size = 100,
    ) {
      const contentType = name.endsWith(".pdf")
        ? "application/pdf"
        : name.endsWith(".pptx")
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "text/plain";
      const response = await createRoute(
        materialRequest(`/api/spaces/${spaceId}/materials`, "POST", cookie, {
          name,
          size,
          contentType,
        }),
        materialSpaceContext(spaceId),
      );
      if (response.status !== 201)
        throw new Error(
          `Synthetic material create failed (${response.status}).`,
        );
      return (await response.json()) as CreateMaterialResponse;
    }
    async function complete(created: CreateMaterialResponse, bytes: Buffer) {
      materialStorage.objects.set(created.upload.pathname, bytes);
      return completeRoute(
        materialRequest(
          `/api/materials/${created.material.id}/complete`,
          "POST",
          students.a.cookie,
        ),
        materialContext(created.material.id),
      );
    }
    async function jobFor(materialId: string) {
      const [row] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.targetId, materialId));
      if (!row) throw new Error("Expected synthetic processing job.");
      return row;
    }
    return {
      ...students,
      aSpace,
      aOther,
      bSpace,
      create,
      complete,
      jobFor,
      published,
      cleanup,
      failPublishing: (fail: boolean) => {
        publishFails = fail;
      },
      row: async (id: string) =>
        (await db.select().from(materials).where(eq(materials.id, id)))[0],
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
