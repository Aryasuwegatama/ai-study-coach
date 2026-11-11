import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { studySpaces } from "@/server/db/schema";
import type { SessionUser } from "./auth-session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres throws on a malformed UUID literal, which would otherwise
 * surface as a 500. `requireSpace()` checks this before querying; the
 * rename/delete conditional updates in `spaces-service.ts` check it too,
 * before running a query that has no separate `requireSpace()` call to do
 * it for them (see that file for why).
 */
export function isValidSpaceId(spaceId: string): boolean {
  return UUID_PATTERN.test(spaceId);
}

/** The narrow space shape every caller gets — never `owner_id` or `deleted_at`. */
export type SpaceRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Request flow step 3 (PRD Section 4): resolves a space the signed-in user
 * owns, or throws the 404 `ApiError` every space-scoped route and page
 * calls this for (T-05 plan, issue #14, "Contracts and interfaces").
 *
 * A missing, deleted, malformed or someone-else's ID all give the
 * identical 404 — never a 400 or a different message that would let a
 * client distinguish "doesn't exist" from "not yours" (PRD Section 2:
 * another student's URL gets "not found"). Postgres throws on a
 * malformed UUID literal, which would otherwise surface as a 500, so the
 * shape is checked first and treated the same as "not found".
 */
export async function requireSpace(spaceId: string, user: SessionUser): Promise<SpaceRecord> {
  if (!isValidSpaceId(spaceId)) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }

  const [space] = await db
    .select({
      id: studySpaces.id,
      name: studySpaces.name,
      createdAt: studySpaces.createdAt,
      updatedAt: studySpaces.updatedAt,
    })
    .from(studySpaces)
    .where(
      and(
        eq(studySpaces.id, spaceId),
        eq(studySpaces.ownerId, user.id),
        isNull(studySpaces.deletedAt),
      ),
    )
    .limit(1);

  if (!space) {
    throw new ApiError("SPACE_NOT_FOUND", "Study space not found.", 404);
  }
  return space;
}
