import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { getSpaceProgress } from "@/features/progress/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    return NextResponse.json(await getSpaceProgress(user, spaceId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
