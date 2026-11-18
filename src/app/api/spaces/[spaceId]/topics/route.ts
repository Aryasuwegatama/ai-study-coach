import { NextResponse } from "next/server";
import { ApiError, parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createTopicSchema, parseTopicsMaterialsFilter } from "@/features/topics/topics-schemas";
import { createTopic, listTopics } from "@/features/topics/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const includeArchived = searchParams.get("include") === "archived";
    const materials = parseTopicsMaterialsFilter(searchParams.get("materials"));
    if (materials === null) {
      throw new ApiError("VALIDATION_ERROR", "materials must be linked, unlinked or any.", 400);
    }
    return NextResponse.json({ topics: await listTopics(user, spaceId, { includeArchived, materials }) });
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
