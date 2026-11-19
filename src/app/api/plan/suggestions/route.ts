import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { getSuggestions } from "@/features/plan/server";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ suggestions: await getSuggestions(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
