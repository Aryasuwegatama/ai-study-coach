import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Receiver } from "@upstash/qstash";
import {
  MATERIAL_TEST_CURRENT_KEY,
  MATERIAL_TEST_NEXT_KEY,
  materialStepRequest,
  signMaterialStep,
} from "../helpers/materials-test-signature";

// Only dispatch is replaced in this boundary test. Signature verification is
// the SDK's real Receiver; DB claim/retry behaviour is tested separately.
const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async () => "done"),
}));
vi.mock("@/server/jobs/jobs-runner", () => ({ runJobStep: dispatch }));
vi.mock("@/server/jobs/jobs-client", () => ({
  qstashReceiver: () =>
    new Receiver({
      currentSigningKey: MATERIAL_TEST_CURRENT_KEY,
      nextSigningKey: MATERIAL_TEST_NEXT_KEY,
    }),
}));
import { POST } from "@/app/api/jobs/step/route";

describe("T-10 signed worker boundary", () => {
  beforeEach(() => {
    dispatch.mockReset();
    dispatch.mockResolvedValue("done");
  });
  it.each(["absent", "wrong-key", "expired", "tampered-body"] as const)(
    "SEC-JOB-01: %s signature is rejected before dispatch",
    async (mode) => {
      const body = JSON.stringify({ jobId: randomUUID(), step: "extract" });
      const signature =
        mode === "absent"
          ? undefined
          : signMaterialStep(body, {
              key: mode === "wrong-key" ? "wrong-synthetic-key" : undefined,
              expired: mode === "expired",
            });
      const response = await POST(
        materialStepRequest(
          mode === "tampered-body"
            ? JSON.stringify({ jobId: randomUUID(), step: "embed" })
            : body,
          signature,
        ),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: "Invalid signature." },
      });
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
  it("SEC-JOB-01: a student-shaped cookie cannot authorise an unsigned worker", async () => {
    const request = materialStepRequest(
      JSON.stringify({ jobId: randomUUID(), step: "extract" }),
    );
    request.headers.set("cookie", "better-auth.session_token=synthetic");
    expect((await POST(request)).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each([
    "not-json",
    JSON.stringify({ jobId: "not-a-uuid", step: "extract" }),
    JSON.stringify({ jobId: randomUUID(), step: "" }),
  ])(
    "SEC-JOB-01: a correctly signed invalid message gives safe 400",
    async (body) => {
      const response = await POST(
        materialStepRequest(body, signMaterialStep(body)),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
  it.each([MATERIAL_TEST_CURRENT_KEY, MATERIAL_TEST_NEXT_KEY])(
    "SEC-JOB-01: current and next test signing keys permit valid dispatch",
    async (key) => {
      const message = { jobId: randomUUID(), step: "extract" };
      const body = JSON.stringify(message);
      expect(
        (await POST(materialStepRequest(body, signMaterialStep(body, { key }))))
          .status,
      ).toBe(200);
      expect(dispatch).toHaveBeenCalledExactlyOnceWith(message);
    },
  );
  it("SEC-JOB-03: retry outcome asks QStash to redeliver with safe 503", async () => {
    dispatch.mockResolvedValue("retry");
    const body = JSON.stringify({ jobId: randomUUID(), step: "extract" });
    const response = await POST(
      materialStepRequest(body, signMaterialStep(body)),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("STEP_RETRY");
  });
  it("SEC-ERROR-01: dispatch exceptions do not expose provider secrets or stack traces", async () => {
    dispatch.mockRejectedValue(new Error("synthetic-provider-secret-sentinel"));
    const body = JSON.stringify({ jobId: randomUUID(), step: "extract" });
    const response = await POST(
      materialStepRequest(body, signMaterialStep(body)),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });
  });
});
