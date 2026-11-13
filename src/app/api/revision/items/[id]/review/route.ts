import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { reviewSchema } from "@/features/revision/revision-schemas";
import { reviewItem } from "@/features/revision/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, reviewSchema);
    return NextResponse.json({ result: await reviewItem(user, id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
