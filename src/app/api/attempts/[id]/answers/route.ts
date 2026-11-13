import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { saveAnswerSchema } from "@/features/attempts/attempts-schemas";
import { saveAnswer } from "@/features/attempts/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, saveAnswerSchema);
    return NextResponse.json({ attempt: await saveAnswer(user, id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
