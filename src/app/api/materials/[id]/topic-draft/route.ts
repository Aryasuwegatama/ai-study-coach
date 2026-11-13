import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { saveTopicDraftSchema } from "@/features/topics/topics-schemas";
import { getTopicDraft, saveTopicDraft } from "@/features/topics/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return NextResponse.json(await getTopicDraft(user, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, saveTopicDraftSchema);
    return NextResponse.json(await saveTopicDraft(user, id, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}
