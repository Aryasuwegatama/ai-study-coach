import { Client, Receiver } from "@upstash/qstash";
import { serverEnv } from "@/lib/server-env";

/**
 * Thin QStash adapter. Claims, leases and the step handlers live in
 * `jobs-runner.ts` (T-08a); features publish steps only through
 * `publishStep`.
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

export type StepMessage = { jobId: string; step: string };

/** Deliveries per step: the first plus QStash retries on a 5xx. */
export const MAX_STEP_ATTEMPTS = 3;

/**
 * Where QStash sends steps (PRD Section 4, `APP_URL`): `APP_URL` when set,
 * else the preview's branch URL, else the auth base URL (always set on
 * Production). QStash can't reach `localhost`, so local runs need a tunnel
 * in `APP_URL`, or the check scripts' fake publisher.
 */
function appUrl(): string {
  const env = serverEnv();
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`;
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  throw new Error("APP_URL is not set.");
}

type Publisher = (message: StepMessage) => Promise<void>;
let testPublisher: Publisher | undefined;

/**
 * Check scripts only: send steps somewhere other than QStash. Set in code
 * by the script itself, never from a request or an environment variable.
 */
export function setPublisherForChecks(publisher: Publisher | undefined): void {
  testPublisher = publisher;
}

export async function publishStep(message: StepMessage): Promise<void> {
  if (testPublisher) return testPublisher(message);
  const env = serverEnv();
  await qstashClient().publishJSON({
    url: new URL("/api/jobs/step", appUrl()).toString(),
    body: message,
    // Lets QStash through Vercel's preview protection (PRD Section 4).
    headers: env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
    // ponytail: every step is `process_material` for now; T-11b passes the
    // `generation` key for quiz and deck steps.
    flowControl: { key: "processing", parallelism: 2 },
    retries: MAX_STEP_ATTEMPTS - 1,
  });
}
