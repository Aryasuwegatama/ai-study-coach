import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createSetSchema } from "@/features/quizzes/quizzes-schemas";
import { createSet, listSets } from "@/features/quizzes/server";
import { listDecks } from "@/features/flashcards/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const kind = new URL(request.url).searchParams.get("kind");
    // Decks have their own list shape (latest practice session, practisable cards).
    if (kind === "deck") return NextResponse.json({ sets: await listDecks(user, spaceId) });
    return NextResponse.json({ sets: await listSets(user, spaceId, kind === "quiz" ? kind : null) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { spaceId } = await params;
    const input = await parseJsonBody(request, createSetSchema);
    return NextResponse.json({ set: await createSet(user, spaceId, input) }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
