import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { startAttempt } from "@/features/attempts/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const { attempt, created } = await startAttempt(user, id);
    return NextResponse.json({ attempt }, { status: created ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
