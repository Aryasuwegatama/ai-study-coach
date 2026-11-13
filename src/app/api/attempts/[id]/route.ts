import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { getAttempt } from "@/features/attempts/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return NextResponse.json({ attempt: await getAttempt(user, id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
