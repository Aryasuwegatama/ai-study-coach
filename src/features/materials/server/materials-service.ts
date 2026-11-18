import { randomUUID } from "node:crypto";
import { and, count, desc, eq, getTableColumns, inArray, isNull, lt, ne } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { materialTopics, materials, studySpaces, topics } from "@/server/db/schema";
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
import { queueProcessing, startProcessing } from "./process-material";

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

/**
 * How long an abandoned `uploading` row is left before `removeAbandonedUploads`
 * treats it as dead (plan step 5). `MATERIAL_UPLOAD_TOKEN_TTL_MS` (5 minutes)
 * is how long the browser's upload token works, and a 10 MB file takes about
 * 80 seconds on a slow connection — so after 15 minutes (3x the token's life)
 * no real upload for that row can still be in progress.
 */
export const ABANDONED_UPLOAD_MS = 3 * MATERIAL_UPLOAD_TOKEN_TTL_MS;

/**
 * Self-heals stuck uploads (plan step 5): removes this space's `uploading`
 * rows older than `ABANDONED_UPLOAD_MS`, Blob file first (a missing file
 * counts as deleted), then the row — but only rows still `uploading`, so one
 * that just moved on is never touched. Run at the start of `listMaterials`
 * and `createMaterial`; never throws, so a clean-up problem never blocks the
 * list or the upload it's guarding.
 *
 * Race with `completeMaterial` (Codex review on #43): the first select below
 * only finds candidates; it doesn't lock anything, so a `complete` call
 * could still move a candidate row to `processing` before this gets to it.
 * Each candidate is therefore re-claimed with `FOR UPDATE SKIP LOCKED` in
 * its own transaction, still `WHERE status = 'uploading'`, *before* the Blob
 * delete — the same row lock `completeMaterial`'s update
 * (`WHERE id AND status = 'uploading'`) needs:
 *   - if clean-up claims the row first, `completeMaterial`'s update waits
 *     on the lock, then finds the row gone once clean-up commits: no job is
 *     queued, and the student sees 404 `MATERIAL_NOT_FOUND`;
 *   - if `completeMaterial` updates first, clean-up's claim finds the row no
 *     longer `uploading` (or `SKIP LOCKED` skips it while held) and leaves
 *     it and its file alone.
 * `completeMaterial` is unchanged — its existing lock is what makes this
 * safe. Each transaction holds its row lock for one `deleteBlob` call,
 * acceptable at this scale (a handful of stale rows at most, on a list or
 * upload request).
 */
async function removeAbandonedUploads(spaceId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_MS);
    const candidates = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.spaceId, spaceId), eq(materials.status, "uploading"), lt(materials.createdAt, cutoff)));

    for (const candidate of candidates) {
      try {
        await db.transaction(async (tx) => {
          const [claimed] = await tx
            .select({ id: materials.id, blobPath: materials.blobPath })
            .from(materials)
            .where(and(eq(materials.id, candidate.id), eq(materials.status, "uploading"), lt(materials.createdAt, cutoff)))
            .for("update", { skipLocked: true });
          // Not found: already handled, moved on since the first select, or
          // another request holds its lock right now — leave it alone.
          if (!claimed) return;

          await deleteBlob(claimed.blobPath);
          await tx.delete(materials).where(and(eq(materials.id, claimed.id), eq(materials.status, "uploading")));
        });
      } catch {
        // The Blob delete failed and the transaction rolled back (the row
        // and file are both kept, exactly as before); skip quietly and let
        // the next list or upload in this space try again.
        continue;
      }
    }
  } catch {
    // Never block the list or the upload it's guarding.
  }
}

/** Newest first. */
export async function listMaterials(user: SessionUser, spaceId: string): Promise<MaterialResponse[]> {
  const space = await requireSpace(spaceId, user);
  await removeAbandonedUploads(space.id);
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
  await removeAbandonedUploads(space.id);

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

  let job: { id: string; step: string } | undefined;
  try {
    // The status change and the processing job commit together.
    job = await db.transaction(async (tx) => {
      const [moved] = await tx
        .update(materials)
        .set({ status: "processing", stage: "extract", fileHash: result.hash, sizeBytes: bytes.length })
        .where(and(eq(materials.id, material.id), eq(materials.status, "uploading")))
        .returning();
      return moved ? queueProcessing(tx, moved, user.id) : undefined;
    });
  } catch (error) {
    // Another upload of the same file won the race between our check and
    // this update; the unique (space_id, file_hash) caught it.
    if (isUniqueViolation(error)) return rejectUpload(material, "DUPLICATE_FILE");
    throw error;
  }

  if (job) await startProcessing(material.id, job);
  // Re-read: processing may already have moved on, or failed to start. With
  // no job, a concurrent "complete" already moved it on (or it was deleted,
  // and requireMaterial now gives the 404).
  return toMaterialResponse(await requireMaterial(materialId, user));
}

export async function retryMaterial(user: SessionUser, materialId: string): Promise<MaterialResponse> {
  const material = await requireMaterial(materialId, user);
  // Same job row, restarted at the step that failed, with a fresh budget.
  const job = await db.transaction(async (tx) => {
    const [moved] = await tx
      .update(materials)
      .set({ status: "processing", errorCode: null })
      .where(and(eq(materials.id, material.id), eq(materials.status, "failed")))
      .returning();
    if (!moved) return undefined;
    const queued = await queueProcessing(tx, moved, user.id);
    await tx.update(materials).set({ stage: queued.step }).where(eq(materials.id, moved.id));
    return queued;
  });
  if (!job) throw materialError("INVALID_MATERIAL_STATE");
  await startProcessing(material.id, job);
  return toMaterialResponse(await requireMaterial(materialId, user));
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
  await db.transaction(async (tx) => {
    // Its unconfirmed draft topics belong to it alone (T-08b); chunks and
    // topic links cascade with the row.
    const drafts = await tx
      .select({ id: topics.id })
      .from(materialTopics)
      .innerJoin(topics, eq(topics.id, materialTopics.topicId))
      .where(and(eq(materialTopics.materialId, material.id), eq(topics.status, "draft")));
    if (drafts.length) await tx.delete(topics).where(inArray(topics.id, drafts.map((d) => d.id)));
    await tx.delete(materials).where(eq(materials.id, material.id));
  });
}
