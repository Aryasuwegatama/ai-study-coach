import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { listRevision } from "@/features/revision/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(await listRevision(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}
