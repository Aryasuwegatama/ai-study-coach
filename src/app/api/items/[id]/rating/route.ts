import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { rateCardSchema } from "@/features/flashcards/flashcards-schemas";
import { rateCard } from "@/features/flashcards/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, rateCardSchema);
    return NextResponse.json(await rateCard(user, id, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}
