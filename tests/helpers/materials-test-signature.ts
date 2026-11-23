import { createHash, createHmac } from "node:crypto";

export const MATERIAL_TEST_ORIGIN = "http://localhost:3000";
export const MATERIAL_TEST_CURRENT_KEY =
  "synthetic-t10-current-key-not-a-service-secret";
export const MATERIAL_TEST_NEXT_KEY =
  "synthetic-t10-next-key-not-a-service-secret";

/** QStash JWT shape used by the real Receiver; never a production token. */
export function signMaterialStep(
  body: string,
  options: { key?: string; expired?: boolean } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: `${MATERIAL_TEST_ORIGIN}/api/jobs/step`,
      iat: now - 1,
      nbf: now - 1,
      exp: options.expired ? now - 60 : now + 300,
      body: createHash("sha256").update(body).digest("base64url"),
    }),
  ).toString("base64url");
  return `${header}.${payload}.${createHmac(
    "sha256",
    options.key ?? MATERIAL_TEST_CURRENT_KEY,
  )
    .update(`${header}.${payload}`)
    .digest("base64url")}`;
}

export function materialStepRequest(body: string, signature?: string): Request {
  return new Request(`${MATERIAL_TEST_ORIGIN}/api/jobs/step`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "upstash-signature": signature } : {}),
    },
    body,
  });
}
