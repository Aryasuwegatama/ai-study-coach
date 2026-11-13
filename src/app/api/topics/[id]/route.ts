import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { updateTopicSchema } from "@/features/topics/topics-schemas";
import { updateTopic } from "@/features/topics/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, updateTopicSchema);
    return NextResponse.json({ topic: await updateTopic(user, id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
