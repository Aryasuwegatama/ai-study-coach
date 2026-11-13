import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createQuizSchema } from "@/features/quizzes/quizzes-schemas";
import { createQuiz, listSets } from "@/features/quizzes/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const kind = new URL(request.url).searchParams.get("kind");
    return NextResponse.json({ sets: await listSets(user, spaceId, kind === "quiz" || kind === "deck" ? kind : null) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const input = await parseJsonBody(request, createQuizSchema);
    return NextResponse.json({ set: await createQuiz(user, spaceId, input) }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
