import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { startSessionSchema } from "@/features/revision/revision-schemas";
import { startSession } from "@/features/revision/server";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await parseJsonBody(request, startSessionSchema);
    return NextResponse.json({ items: await startSession(user, spaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
