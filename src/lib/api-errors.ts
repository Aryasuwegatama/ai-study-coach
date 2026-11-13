import { NextResponse } from "next/server";

/**
 * The stable API error shape every route uses (PRD Section 4, "Error
 * format"): `{ "error": { "code", "message" } }`. Codes are stable so the
 * UI and tests can rely on them; messages are safe to show a student —
 * never a stack trace or raw provider output (Security rule 10).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Converts any thrown value into the stable error response. Route
 * handlers call this from a catch block:
 *
 *   try {
 *     const user = await requireUser();
 *     ...
 *   } catch (error) {
 *     return toErrorResponse(error);
 *   }
 *
 * An `ApiError` (e.g. from `requireUser()`) keeps its code, message and
 * status. Anything else becomes a generic 500 with no details leaked.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.status);
  }
  return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
}

/**
 * Reads a JSON body and checks it with a Zod schema; any problem is a 400
 * `VALIDATION_ERROR` with the first issue's message. Unknown keys are
 * stripped, never trusted (Security rule 1).
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: { safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "The request body must be valid JSON.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  return parsed.data;
}
