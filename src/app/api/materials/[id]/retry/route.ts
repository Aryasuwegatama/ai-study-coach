import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { retryMaterial } from "@/features/materials/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const material = await retryMaterial(user, id);
    return NextResponse.json({ material }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
