import { NextResponse } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { mistakesQuerySchema } from "@/features/revision/revision-schemas";
import { listMistakes } from "@/features/revision/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const parsed = mistakesQuerySchema.safeParse({
      topicId: params.get("topicId") ?? undefined,
      spaceId: params.get("spaceId") ?? undefined,
    });
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    return NextResponse.json(await listMistakes(user, parsed.data));
  } catch (error) {
    return toErrorResponse(error);
  }
}
