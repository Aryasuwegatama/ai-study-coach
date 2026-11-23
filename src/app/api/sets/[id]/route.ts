import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { deleteSet, getSet, renameSet } from "@/features/quizzes/server";
import { renameSetSchema } from "@/features/quizzes/quizzes-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return NextResponse.json(await getSet(user, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Rename: `{ title }` → `{ set }`. Someone else's set → 404 `SET_NOT_FOUND`. */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, renameSetSchema);
    return NextResponse.json({ set: await renameSet(user, id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    await deleteSet(user, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
