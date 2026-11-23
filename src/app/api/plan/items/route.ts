import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createPlanItemSchema } from "@/features/plan/plan-schemas";
import { createPlanItem, listPlanItems } from "@/features/plan/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ items: await listPlanItems(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await parseJsonBody(request, createPlanItemSchema);
    return NextResponse.json({ item: await createPlanItem(user, input) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
