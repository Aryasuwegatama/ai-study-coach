import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/server/auth/auth-session";
import { createReportSchema } from "@/features/reports/reports-schemas";
import { createReport } from "@/features/reports/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const input = await parseJsonBody(request, createReportSchema);
    return NextResponse.json({ report: await createReport(user, id, input) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
