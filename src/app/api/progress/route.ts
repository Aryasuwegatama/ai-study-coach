import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { getAllProgress } from "@/features/progress/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ spaces: await getAllProgress(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
