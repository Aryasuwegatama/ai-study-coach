import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createMaterial, listMaterials } from "@/features/materials/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const materials = await listMaterials(user, spaceId);
    return NextResponse.json({ materials });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    // Invalid JSON becomes `undefined`, which the parser answers with the
    // contract's VALIDATION_ERROR (after requireSpace, so a missing space
    // is still a 404).
    const body: unknown = await request.json().catch(() => undefined);
    const created = await createMaterial(user, spaceId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
