import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createTopicSchema } from "@/features/topics/topics-schemas";
import { createTopic, listTopics } from "@/features/topics/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const includeArchived = new URL(request.url).searchParams.get("include") === "archived";
    return NextResponse.json({ topics: await listTopics(user, spaceId, includeArchived) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const input = await parseJsonBody(request, createTopicSchema);
    return NextResponse.json({ topic: await createTopic(user, spaceId, input) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
