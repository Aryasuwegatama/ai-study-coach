import { materialStorage } from "../helpers/materials-fake-storage";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { materials, studySpaces } from "@/server/db/schema";
import {
  ACCEPTED_FILE_TYPES,
  MAX_MATERIAL_BYTES,
  MATERIAL_UPLOAD_TOKEN_TTL_MS,
} from "@/features/materials/materials-schemas";
import {
  GET as list,
  POST as create,
} from "@/app/api/spaces/[spaceId]/materials/route";
import { POST as complete } from "@/app/api/materials/[id]/complete/route";
import { POST as retry } from "@/app/api/materials/[id]/retry/route";
import { GET as download } from "@/app/api/materials/[id]/file/route";
import { DELETE as remove } from "@/app/api/materials/[id]/route";
import {
  GET as topicList,
  POST as topicCreate,
} from "@/app/api/spaces/[spaceId]/topics/route";
import {
  GET as draftGet,
  PUT as draftPut,
} from "@/app/api/materials/[id]/topic-draft/route";
import { POST as draftConfirm } from "@/app/api/materials/[id]/topic-draft/confirm/route";
import { PATCH as topicPatch } from "@/app/api/topics/[id]/route";
import {
  createMaterialsFixture,
  materialContext,
  materialRequest,
  materialSpaceContext,
} from "../helpers/materials-integration-fixture";

describe("T-10 material upload and ownership integration", () => {
  let f: Awaited<ReturnType<typeof createMaterialsFixture>> | undefined;
  beforeEach(async () => {
    f = await createMaterialsFixture();
  });
  afterEach(async () => {
    await f?.cleanup();
    f = undefined;
  });
  const materialCalls = (id: string, cookie?: string) => [
    () =>
      complete(
        materialRequest(`/api/materials/${id}/complete`, "POST", cookie),
        materialContext(id),
      ),
    () =>
      retry(
        materialRequest(`/api/materials/${id}/retry`, "POST", cookie),
        materialContext(id),
      ),
    () =>
      download(
        materialRequest(`/api/materials/${id}/file`, "GET", cookie),
        materialContext(id),
      ),
    () =>
      remove(
        materialRequest(`/api/materials/${id}`, "DELETE", cookie),
        materialContext(id),
      ),
    () =>
      draftGet(
        materialRequest(`/api/materials/${id}/topic-draft`, "GET", cookie),
        materialContext(id),
      ),
    () =>
      draftPut(
        materialRequest(`/api/materials/${id}/topic-draft`, "PUT", cookie, {
          topics: [],
        }),
        materialContext(id),
      ),
    () =>
      draftConfirm(
        materialRequest(
          `/api/materials/${id}/topic-draft/confirm`,
          "POST",
          cookie,
        ),
        materialContext(id),
      ),
  ];

  it("SEC-OWNER-01: client identity and pathname claims cannot choose another space or storage object", async () => {
    const response = await create(
      materialRequest(
        `/api/spaces/${f!.aSpace.id}/materials`,
        "POST",
        f!.a.cookie,
        {
          name: "synthetic.txt",
          size: 10,
          contentType: "text/plain",
          ownerId: f!.b.user.id,
          userId: f!.b.user.id,
          role: "admin",
          spaceId: f!.bSpace.id,
          blobPath: "other-student/private.txt",
        },
      ),
      materialSpaceContext(f!.aSpace.id),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect((await f!.row(body.material.id))?.spaceId).toBe(f!.aSpace.id);
    expect(body.upload.pathname).toMatch(/^materials\/[0-9a-f-]+\.txt$/);
    expect(body.upload.pathname).not.toContain("other-student");
    expect(
      await db
        .select()
        .from(materials)
        .where(eq(materials.spaceId, f!.bSpace.id)),
    ).toHaveLength(0);
  });

  it("SEC-UPLOAD-05: complete before upload is a safe conflict and cancel leaves no job", async () => {
    const created = await f!.create();
    const response = await complete(
      materialRequest(
        `/api/materials/${created.material.id}/complete`,
        "POST",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("UPLOAD_INCOMPLETE");
    expect((await f!.row(created.material.id))?.status).toBe("uploading");
    expect(
      (
        await remove(
          materialRequest(
            `/api/materials/${created.material.id}`,
            "DELETE",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await complete(
          materialRequest(
            `/api/materials/${created.material.id}/complete`,
            "POST",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(404);
    expect(f!.published).toHaveLength(0);
  });

  it("SEC-OWNER-01: every Materials/Topics handler rejects an absent session", async () => {
    const id = randomUUID(),
      spaceId = f!.aSpace.id;
    const calls = [
      ...materialCalls(id),
      () =>
        list(
          materialRequest(`/api/spaces/${spaceId}/materials`),
          materialSpaceContext(spaceId),
        ),
      () =>
        create(
          materialRequest(
            `/api/spaces/${spaceId}/materials`,
            "POST",
            undefined,
            {},
          ),
          materialSpaceContext(spaceId),
        ),
      () =>
        topicList(
          materialRequest(`/api/spaces/${spaceId}/topics`),
          materialSpaceContext(spaceId),
        ),
      () =>
        topicCreate(
          materialRequest(
            `/api/spaces/${spaceId}/topics`,
            "POST",
            undefined,
            {},
          ),
          materialSpaceContext(spaceId),
        ),
      () =>
        topicPatch(
          materialRequest(`/api/topics/${id}`, "PATCH", undefined, {}),
          materialContext(id),
        ),
    ];
    for (const call of calls) {
      const response = await call();
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    }
    expect(materialStorage.tokens).toHaveLength(0);
    expect(materialStorage.reads).toHaveLength(0);
  });

  it("SEC-OWNER-01: B cannot read/change A's material; all inaccessible IDs have identical material 404", async () => {
    const created = await f!.create();
    materialStorage.objects.set(
      created.upload.pathname,
      Buffer.from("Private synthetic text"),
    );
    const before = await f!.row(created.material.id);
    const deleted = await f!.create("deleted.txt");
    await remove(
      materialRequest(
        `/api/materials/${deleted.material.id}`,
        "DELETE",
        f!.a.cookie,
      ),
      materialContext(deleted.material.id),
    );
    for (const id of [
      created.material.id,
      randomUUID(),
      "not-a-uuid",
      deleted.material.id,
    ]) {
      for (const call of materialCalls(id, f!.b.cookie)) {
        const response = await call();
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          error: { code: "MATERIAL_NOT_FOUND", message: "Material not found." },
        });
      }
    }
    expect(await f!.row(created.material.id)).toEqual(before);
    expect(
      materialStorage.objects.get(created.upload.pathname)?.toString(),
    ).toBe("Private synthetic text");
    expect(materialStorage.reads).toHaveLength(0);
    expect(f!.published).toHaveLength(0);
  });

  it("SEC-OWNER-01: foreign and soft-deleted spaces hide their collections and children immediately", async () => {
    const created = await f!.create();
    for (const cookie of [f!.b.cookie, f!.a.cookie]) {
      if (cookie === f!.a.cookie)
        await db
          .update(studySpaces)
          .set({ deletedAt: new Date() })
          .where(eq(studySpaces.id, f!.aSpace.id));
      for (const handler of [list, topicList]) {
        const response = await handler(
          materialRequest(
            `/api/spaces/${f!.aSpace.id}/materials`,
            "GET",
            cookie,
          ),
          materialSpaceContext(f!.aSpace.id),
        );
        expect(response.status).toBe(404);
        expect((await response.json()).error.code).toBe("SPACE_NOT_FOUND");
      }
      for (const call of materialCalls(created.material.id, cookie))
        expect((await call()).status).toBe(404);
    }
    const ownList = await list(
      materialRequest(
        `/api/spaces/${f!.bSpace.id}/materials`,
        "GET",
        f!.b.cookie,
      ),
      materialSpaceContext(f!.bSpace.id),
    );
    expect(await ownList.json()).toEqual({ materials: [] });
  });

  it("SEC-UPLOAD-02: capability options are server-scoped; material responses hide internal fields", async () => {
    const start = Date.now();
    const created = await f!.create("../../synthetic.txt");
    expect(created.upload.pathname).toMatch(/^materials\/[0-9a-f-]+\.txt$/);
    expect(materialStorage.tokens[0]).toEqual({
      pathname: created.upload.pathname,
      allowedContentTypes: ACCEPTED_FILE_TYPES.map((type) => type.mimeType),
      maxBytes: MAX_MATERIAL_BYTES,
      validUntil: expect.any(Number),
    });
    expect(materialStorage.tokens[0].validUntil).toBeGreaterThanOrEqual(
      start + MATERIAL_UPLOAD_TOKEN_TTL_MS,
    );
    expect(materialStorage.tokens[0].validUntil).toBeLessThanOrEqual(
      Date.now() + MATERIAL_UPLOAD_TOKEN_TTL_MS,
    );
    for (const field of ["blobPath", "fileHash", "ownerId", "spaceId"])
      expect(Object.keys(created.material)).not.toContain(field);
  });

  it("SEC-UPLOAD-01: spoofed PDF is rejected and its storage/row are removed", async () => {
    const created = await f!.create("fake.pdf");
    const response = await f!.complete(created, Buffer.from("Not a PDF"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(await f!.row(created.material.id)).toBeUndefined();
    expect(materialStorage.objects.has(created.upload.pathname)).toBe(false);
    expect(f!.published).toHaveLength(0);
  });

  it("SEC-UPLOAD-02: actual server bytes beat the browser's size claim", async () => {
    const created = await f!.create(
      "synthetic.txt",
      f!.a.cookie,
      f!.aSpace.id,
      1,
    );
    const response = await f!.complete(
      created,
      Buffer.alloc(MAX_MATERIAL_BYTES + 1, 65),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("FILE_TOO_LARGE");
    expect(await f!.row(created.material.id)).toBeUndefined();
    expect(materialStorage.objects.size).toBe(0);
  });

  it("SEC-UPLOAD-05: duplicate completion is idempotent and same-space content duplication is rejected", async () => {
    const bytes = Buffer.from("Synthetic database keys and normal forms.");
    const created = await f!.create();
    expect((await f!.complete(created, bytes)).status).toBe(200);
    const job = await f!.jobFor(created.material.id);
    expect(
      (
        await complete(
          materialRequest(
            `/api/materials/${created.material.id}/complete`,
            "POST",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(200);
    expect((await f!.jobFor(created.material.id)).id).toBe(job.id);
    expect(f!.published).toHaveLength(1);
    const duplicate = await f!.create("duplicate.txt");
    const response = await f!.complete(duplicate, bytes);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_FILE");
    expect(await f!.row(duplicate.material.id)).toBeUndefined();
    expect(materialStorage.objects.has(duplicate.upload.pathname)).toBe(false);
  });

  it("SEC-DELETE-01: failed Blob deletion preserves the complete row; retry deletes safely", async () => {
    const created = await f!.create();
    materialStorage.objects.set(
      created.upload.pathname,
      Buffer.from("Synthetic file"),
    );
    const before = await f!.row(created.material.id);
    materialStorage.failDelete = true;
    const failed = await remove(
      materialRequest(
        `/api/materials/${created.material.id}`,
        "DELETE",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(failed.status).toBe(503);
    expect((await failed.json()).error.code).toBe("MATERIAL_DELETE_FAILED");
    expect(await f!.row(created.material.id)).toEqual(before);
    materialStorage.failDelete = false;
    expect(
      (
        await remove(
          materialRequest(
            `/api/materials/${created.material.id}`,
            "DELETE",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(204);
    expect(await f!.row(created.material.id)).toBeUndefined();
    expect(materialStorage.objects.size).toBe(0);
  });

  it("SEC-UPLOAD-04: owner receives original bytes in a private attachment after completion", async () => {
    const created = await f!.create();
    const bytes = Buffer.from("Private synthetic study notes.");
    expect((await f!.complete(created, bytes)).status).toBe(200);
    const response = await download(
      materialRequest(
        `/api/materials/${created.material.id}/file`,
        "GET",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const [stored] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, created.material.id));
    expect(stored.sizeBytes).toBe(bytes.length);
  });

  it.each([
    [{ name: "", size: 1, contentType: "text/plain" }, "VALIDATION_ERROR"],
    [
      { name: "bad.exe", size: 1, contentType: "text/plain" },
      "UNSUPPORTED_FILE_TYPE",
    ],
    [
      {
        name: "notes.txt",
        size: MAX_MATERIAL_BYTES + 1,
        contentType: "text/plain",
      },
      "FILE_TOO_LARGE",
    ],
    [
      { name: "notes\r\n.txt", size: 1, contentType: "text/plain" },
      "VALIDATION_ERROR",
    ],
  ])(
    "SEC-UPLOAD-01: request validation rejects %j before minting a capability",
    async (body, code) => {
      const response = await create(
        materialRequest(
          `/api/spaces/${f!.aSpace.id}/materials`,
          "POST",
          f!.a.cookie,
          body,
        ),
        materialSpaceContext(f!.aSpace.id),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(code);
      expect(materialStorage.tokens).toHaveLength(0);
    },
  );

  it("SEC-UPLOAD-05: concurrent creates cannot exceed twenty materials", async () => {
    await db.insert(materials).values(
      Array.from({ length: 19 }, () => {
        const id = randomUUID();
        return {
          id,
          spaceId: f!.aSpace.id,
          originalName: "seeded.txt",
          blobPath: `t10/${id}`,
        };
      }),
    );
    const responses = await Promise.all(
      ["one.txt", "two.txt"].map((name) =>
        create(
          materialRequest(
            `/api/spaces/${f!.aSpace.id}/materials`,
            "POST",
            f!.a.cookie,
            { name, size: 10, contentType: "text/plain" },
          ),
          materialSpaceContext(f!.aSpace.id),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const failed = responses.find((response) => response.status === 409)!;
    expect((await failed.json()).error.code).toBe("MATERIAL_LIMIT_REACHED");
    expect(
      await db
        .select()
        .from(materials)
        .where(eq(materials.spaceId, f!.aSpace.id)),
    ).toHaveLength(20);
  });

  it("SEC-UPLOAD-05: racing complete calls for one material keep a single processing job", async () => {
    const created = await f!.create();
    materialStorage.objects.set(
      created.upload.pathname,
      Buffer.from("Synthetic readable concurrent upload."),
    );
    const calls = () =>
      complete(
        materialRequest(
          `/api/materials/${created.material.id}/complete`,
          "POST",
          f!.a.cookie,
        ),
        materialContext(created.material.id),
      );
    const responses = await Promise.all([calls(), calls()]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(f!.published).toHaveLength(1);
    expect((await f!.jobFor(created.material.id)).idempotencyKey).toBe(
      `process_material:${created.material.id}`,
    );
  });

  it("SEC-UPLOAD-05: racing identical uploads produces one winner and removes the duplicate", async () => {
    const first = await f!.create("one.txt"),
      second = await f!.create("two.txt");
    const bytes = Buffer.from(
      "Identical synthetic bytes in two concurrent uploads.",
    );
    materialStorage.objects.set(first.upload.pathname, bytes);
    materialStorage.objects.set(second.upload.pathname, bytes);
    const responses = await Promise.all(
      [first, second].map((entry) =>
        complete(
          materialRequest(
            `/api/materials/${entry.material.id}/complete`,
            "POST",
            f!.a.cookie,
          ),
          materialContext(entry.material.id),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(f!.published).toHaveLength(1);
    expect(materialStorage.objects.size).toBe(1);
  });

  it("SEC-DELETE-01: rejection with failed Blob deletion retains a retryable row/path", async () => {
    const created = await f!.create("fake.pdf");
    materialStorage.failDelete = true;
    const response = await f!.complete(created, Buffer.from("Not a PDF"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect((await f!.row(created.material.id))?.status).toBe("uploading");
    expect(materialStorage.objects.has(created.upload.pathname)).toBe(true);
    materialStorage.failDelete = false;
    expect(
      (
        await remove(
          materialRequest(
            `/api/materials/${created.material.id}`,
            "DELETE",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(204);
    expect(await f!.row(created.material.id)).toBeUndefined();
  });

  it("SEC-UPLOAD-04: an absent Blob reports FILE_UNAVAILABLE, and deletion safely removes the row", async () => {
    const created = await f!.create();
    await f!.complete(created, Buffer.from("Synthetic file to retire."));
    materialStorage.objects.delete(created.upload.pathname);
    const response = await download(
      materialRequest(
        `/api/materials/${created.material.id}/file`,
        "GET",
        f!.a.cookie,
      ),
      materialContext(created.material.id),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("FILE_UNAVAILABLE");
    expect(
      (
        await remove(
          materialRequest(
            `/api/materials/${created.material.id}`,
            "DELETE",
            f!.a.cookie,
          ),
          materialContext(created.material.id),
        )
      ).status,
    ).toBe(204);
  });
});
