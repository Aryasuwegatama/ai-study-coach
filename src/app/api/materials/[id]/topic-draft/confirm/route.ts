import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { confirmTopicDraft } from "@/features/topics/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return NextResponse.json(await confirmTopicDraft(user, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
