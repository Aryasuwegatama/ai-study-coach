import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { deleteMaterial } from "@/features/materials/server";

type RouteContext = { params: Promise<{ id: string }> };

/** Delete, and cancel of an upload in progress: 204 in any status. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    await deleteMaterial(user, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
