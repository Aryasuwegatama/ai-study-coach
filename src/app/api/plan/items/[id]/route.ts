import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { updatePlanItemSchema } from "@/features/plan/plan-schemas";
import { deletePlanItem, updatePlanItem } from "@/features/plan/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, updatePlanItemSchema);
    return NextResponse.json({ item: await updatePlanItem(user, id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    await deletePlanItem(user, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
