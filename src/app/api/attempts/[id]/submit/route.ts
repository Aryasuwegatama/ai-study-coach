import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { submitAttempt } from "@/features/attempts/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    // The body is never read: the server scores (a forged score is ignored).
    return NextResponse.json({ attempt: await submitAttempt(user, id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
