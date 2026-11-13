import { randomUUID } from "node:crypto";
import { and, count, desc, eq, getTableColumns, isNull, ne } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { materials, studySpaces } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import {
  blobExists,
  createUploadToken,
  deleteBlob,
  getPrivateBlob,
} from "@/server/storage/storage-client";
import {
  ACCEPTED_FILE_TYPES,
  MATERIAL_API_ERRORS,
  MATERIAL_FAILURE_REASONS,
  MATERIAL_UPLOAD_TOKEN_TTL_MS,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS_PER_SPACE,
  isValidMaterialId,
  parseCreateMaterialRequest,
  type CreateMaterialResponse,
  type MaterialApiErrorCode,
  type MaterialFailureCode,
  type MaterialResponse,
  type MaterialStage,
  type MaterialStatus,
} from "../materials-schemas";
import { checkUploadedFile } from "./verify-file";

/** Server-only row: carries `blobPath` and `fileHash`, so it is never serialised. */
export type MaterialRecord = typeof materials.$inferSelect;

export function materialError(code: MaterialApiErrorCode): ApiError {
  const { status, message } = MATERIAL_API_ERRORS[code];
  return new ApiError(code, message, status);
}

/** Built field by field, so `blobPath`, `fileHash` and the owner can never leak. */
export function toMaterialResponse(row: MaterialRecord): MaterialResponse {
  const errorCode = row.errorCode as MaterialFailureCode | null;
  return {
    id: row.id,
    originalName: row.originalName,
    status: row.status as MaterialStatus,
    stage: row.stage as MaterialStage | null,
    progress:
      row.progressDone !== null && row.progressTotal !== null
        ? { done: row.progressDone, total: row.progressTotal }
        : null,
    error:
      row.status === "failed" && errorCode
        ? { code: errorCode, message: MATERIAL_FAILURE_REASONS[errorCode] }
        : null,
    pageCount: row.pageCount,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolves a material the user owns, in a Study Space that isn't deleted,
 * with ONE joined query. Missing, malformed, someone else's and
 * deleted-space materials all throw the identical 404 (contract in
 * `materials-schemas.ts`).
 */
export async function requireMaterial(materialId: string, user: SessionUser): Promise<MaterialRecord> {
  if (!isValidMaterialId(materialId)) throw materialError("MATERIAL_NOT_FOUND");

  const [row] = await db
    .select(getTableColumns(materials))
    .from(materials)
    .innerJoin(studySpaces, eq(studySpaces.id, materials.spaceId))
    .where(
      and(
        eq(materials.id, materialId),
        eq(studySpaces.ownerId, user.id),
        isNull(studySpaces.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw materialError("MATERIAL_NOT_FOUND");
  return row;
}

/** Newest first. */
export async function listMaterials(user: SessionUser, spaceId: string): Promise<MaterialResponse[]> {
  const space = await requireSpace(spaceId, user);
  const rows = await db
    .select()
    .from(materials)
    .where(eq(materials.spaceId, space.id))
    .orderBy(desc(materials.createdAt));
  return rows.map(toMaterialResponse);
}

export async function createMaterial(
  user: SessionUser,
  spaceId: string,
  body: unknown,
): Promise<CreateMaterialResponse> {
  const space = await requireSpace(spaceId, user);

  const parsed = parseCreateMaterialRequest(body);
  if (!parsed.success) {
    const { code, message } = parsed.error;
    throw new ApiError(code, message, MATERIAL_API_ERRORS[code].status);
  }

  const { name } = parsed.data;
  const lower = name.toLowerCase();
  const type = ACCEPTED_FILE_TYPES.find((t) => lower.endsWith(t.extension))!;
  const id = randomUUID();
  // Server-generated, never built from the file name.
  const blobPath = `materials/${id}${type.extension}`;

  const row = await db.transaction(async (tx) => {
    // Locking the space row makes concurrent creates wait their turn, so
    // two requests can't both see 19 and insert the 21st.
    await tx
      .select({ id: studySpaces.id })
      .from(studySpaces)
      .where(eq(studySpaces.id, space.id))
      .for("update");
    const [{ total }] = await tx
      .select({ total: count() })
      .from(materials)
      .where(eq(materials.spaceId, space.id));
    if (total >= MAX_MATERIALS_PER_SPACE) throw materialError("MATERIAL_LIMIT_REACHED");

    const [inserted] = await tx
      .insert(materials)
      .values({ id, spaceId: space.id, originalName: name, blobPath })
      .returning();
    return inserted;
  });

  const clientToken = await createUploadToken({
    pathname: blobPath,
    allowedContentTypes: ACCEPTED_FILE_TYPES.map((t) => t.mimeType),
    maxBytes: MAX_MATERIAL_BYTES,
    validUntil: Date.now() + MATERIAL_UPLOAD_TOKEN_TTL_MS,
  });

  return { material: toMaterialResponse(row), upload: { pathname: blobPath, clientToken } };
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Removes a rejected upload, file first and then row, and throws the
 * rejection. If the Blob delete fails the row stays (still `uploading`,
 * still pointing at the file), so the daily cron or a delete can finish
 * the job; the student still sees the real reason.
 */
async function rejectUpload(material: MaterialRecord, code: MaterialApiErrorCode): Promise<never> {
  try {
    await deleteBlob(material.blobPath);
    await db.delete(materials).where(eq(materials.id, material.id));
  } catch {
    // Keep the original rejection; nothing is orphaned either way.
  }
  throw materialError(code);
}

export async function completeMaterial(user: SessionUser, materialId: string): Promise<MaterialResponse> {
  const material = await requireMaterial(materialId, user);
  // Idempotent: a network retry after success gets the current material.
  if (material.status !== "uploading") return toMaterialResponse(material);

  // `head` decides whether the upload landed: measured 0/15 misses straight
  // after an upload. `get` missed 4/15 times for 1-2 s when the same path
  // had been read before the upload (an earlier "complete"), so it gets a
  // few seconds to catch up once `head` has seen the file.
  if (!(await blobExists(material.blobPath))) throw materialError("UPLOAD_INCOMPLETE");
  let blob = await getPrivateBlob(material.blobPath);
  for (let attempt = 0; !blob && attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    blob = await getPrivateBlob(material.blobPath);
  }
  if (!blob) throw materialError("UPLOAD_INCOMPLETE");
  if (blob.blob.size > MAX_MATERIAL_BYTES) return rejectUpload(material, "FILE_TOO_LARGE");

  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
  const result = checkUploadedFile(material.originalName, bytes);
  if (!result.ok) return rejectUpload(material, result.code);

  const [duplicate] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(
        eq(materials.spaceId, material.spaceId),
        eq(materials.fileHash, result.hash),
        ne(materials.id, material.id),
      ),
    )
    .limit(1);
  if (duplicate) return rejectUpload(material, "DUPLICATE_FILE");

  let updated: MaterialRecord | undefined;
  try {
    // T-08a starts the processing job here.
    [updated] = await db
      .update(materials)
      .set({ status: "processing", fileHash: result.hash, sizeBytes: bytes.length })
      .where(and(eq(materials.id, material.id), eq(materials.status, "uploading")))
      .returning();
  } catch (error) {
    // Another upload of the same file won the race between our check and
    // this update; the unique (space_id, file_hash) caught it.
    if (isUniqueViolation(error)) return rejectUpload(material, "DUPLICATE_FILE");
    throw error;
  }

  // Zero rows: a concurrent "complete" already moved it on (or it was
  // deleted, and requireMaterial now gives the 404).
  return toMaterialResponse(updated ?? (await requireMaterial(materialId, user)));
}

export async function retryMaterial(user: SessionUser, materialId: string): Promise<MaterialResponse> {
  const material = await requireMaterial(materialId, user);
  const [updated] = await db
    .update(materials)
    .set({ status: "processing", stage: null, errorCode: null, progressDone: null, progressTotal: null })
    .where(and(eq(materials.id, material.id), eq(materials.status, "failed")))
    .returning();
  if (!updated) throw materialError("INVALID_MATERIAL_STATE");
  // T-08a restarts the failed step here.
  return toMaterialResponse(updated);
}

export async function getMaterialFile(user: SessionUser, materialId: string) {
  const material = await requireMaterial(materialId, user);
  if (material.status === "uploading") throw materialError("INVALID_MATERIAL_STATE");

  const blob = await getPrivateBlob(material.blobPath);
  if (!blob) throw materialError("FILE_UNAVAILABLE");

  const lower = material.originalName.toLowerCase();
  const type = ACCEPTED_FILE_TYPES.find((t) => lower.endsWith(t.extension));
  return {
    stream: blob.stream,
    size: blob.blob.size,
    originalName: material.originalName,
    contentType: type?.mimeType ?? "application/octet-stream",
  };
}

/**
 * Hard delete (Arya, 2026-11-13): the Blob file first, then the row. If
 * the Blob delete fails nothing changes, so a retry finishes the job and
 * no file is ever left without a row pointing to it.
 */
export async function deleteMaterial(user: SessionUser, materialId: string): Promise<void> {
  const material = await requireMaterial(materialId, user);
  try {
    await deleteBlob(material.blobPath);
  } catch {
    throw materialError("MATERIAL_DELETE_FAILED");
  }
  await db.delete(materials).where(eq(materials.id, material.id));
}
