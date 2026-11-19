import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { contentReports, learningItems, studySets, studySpaces } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import { REPORT_API_ERRORS, type CreateReportRequest, type ReportApiErrorCode, type ReportResponse } from "../reports-schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reportError(code: ReportApiErrorCode): ApiError {
  const { status, message } = REPORT_API_ERRORS[code];
  return new ApiError(code, message, status);
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** A learning item the student owns (through its quiz's space), in a space that isn't deleted. */
async function requireItem(itemId: string, user: SessionUser): Promise<{ id: string; spaceId: string }> {
  if (!UUID.test(itemId)) throw reportError("ITEM_NOT_FOUND");
  const [row] = await db
    .select({ id: learningItems.id, spaceId: learningItems.spaceId })
    .from(learningItems)
    .innerJoin(studySets, eq(studySets.id, learningItems.setId))
    .innerJoin(studySpaces, eq(studySpaces.id, studySets.spaceId))
    .where(and(eq(learningItems.id, itemId), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .limit(1);
  if (!row) throw reportError("ITEM_NOT_FOUND");
  return row;
}

/**
 * Inserts the report and, when asked, removes the item from practice —
 * both in one transaction, so a reported item is never left `active` if
 * the checkbox was ticked (PRD Section 2 "Reports").
 */
export async function createReport(user: SessionUser, itemId: string, input: CreateReportRequest): Promise<ReportResponse> {
  const item = await requireItem(itemId, user);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contentReports)
        .values({
          spaceId: item.spaceId,
          itemId: item.id,
          reporterId: user.id,
          reason: input.reason,
          comment: input.comment && input.comment.length > 0 ? input.comment : null,
          removedFromPractice: input.removeFromPractice,
        })
        .returning();
      if (input.removeFromPractice) {
        await tx.update(learningItems).set({ status: "removed" }).where(eq(learningItems.id, item.id));
      }
      return {
        itemId: row.itemId,
        reason: row.reason as ReportResponse["reason"],
        removedFromPractice: row.removedFromPractice,
        createdAt: row.createdAt.toISOString(),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw reportError("ITEM_ALREADY_REPORTED");
    throw error;
  }
}
