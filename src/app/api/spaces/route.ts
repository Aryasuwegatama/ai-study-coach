import { NextResponse } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createSpaceSchema } from "@/features/spaces/spaces-schemas";
import { createSpace, listSpaces } from "@/features/spaces/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const spaces = await listSpaces(user);
    return NextResponse.json({ spaces });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "The request body must be valid JSON.", 400);
    }

    const parsed = createSpaceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid study space name.",
        400,
      );
    }

    const space = await createSpace(user, parsed.data.name);
    return NextResponse.json({ space }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
