import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { completeMaterial } from "@/features/materials/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const material = await completeMaterial(user, id);
    return NextResponse.json({ material });
  } catch (error) {
    return toErrorResponse(error);
  }
}
