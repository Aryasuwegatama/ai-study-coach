import { NextResponse } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { renameSpaceSchema } from "@/features/spaces/spaces-schemas";
import { deleteSpace, renameSpace } from "@/features/spaces/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "The request body must be valid JSON.", 400);
    }

    const parsed = renameSpaceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid study space name.",
        400,
      );
    }

    const space = await renameSpace(user, spaceId, parsed.data.name);
    return NextResponse.json({ space });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    await deleteSpace(user, spaceId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
