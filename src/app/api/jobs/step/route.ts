import { z } from "zod";
import { errorResponse, toErrorResponse } from "@/lib/api-errors";
import { qstashReceiver } from "@/server/jobs/jobs-client";
import { runJobStep } from "@/server/jobs/jobs-runner";

/** One step stays well under this (PRD Section 4, "Background jobs"). */
export const maxDuration = 300;

const stepMessageSchema = z.object({ jobId: z.uuid(), step: z.string().min(1).max(64) });

/**
 * QStash delivers job steps here. Unsigned or wrongly signed calls get
 * 401 (Security rule 7); the signature covers the body, so the job id and
 * step are QStash's. 200 means done or nothing to do; 503 asks QStash to
 * redeliver.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  try {
    if (!signature) throw new Error("missing signature");
    await qstashReceiver().verify({ signature, body });
  } catch {
    return errorResponse("UNAUTHORIZED", "Invalid signature.", 401);
  }

  let message;
  try {
    message = stepMessageSchema.parse(JSON.parse(body));
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid job step.", 400);
  }

  try {
    const outcome = await runJobStep(message);
    if (outcome === "retry") return errorResponse("STEP_RETRY", "Step will be retried.", 503);
    return Response.json({ outcome });
  } catch (error) {
    return toErrorResponse(error);
  }
}
