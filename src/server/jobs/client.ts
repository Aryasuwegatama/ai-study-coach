import { Client, Receiver } from "@upstash/qstash";
import { serverEnv } from "@/lib/env";

/**
 * Thin QStash adapter: configuration only. The actual step handler, claims,
 * leases and the two-job generation admission (PRD Section 4, "Background
 * jobs") are T-08a/T-11b scope, not this task.
 */
let client: Client | undefined;

/** Used to publish job steps. */
export function qstashClient(): Client {
  client ??= new Client({ token: serverEnv().QSTASH_TOKEN });
  return client;
}

/**
 * Used by the signed job-step route (`POST /api/jobs/step`) to verify a
 * request really came from QStash (Security rule 7).
 */
export function qstashReceiver(): Receiver {
  const env = serverEnv();
  return new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
}
