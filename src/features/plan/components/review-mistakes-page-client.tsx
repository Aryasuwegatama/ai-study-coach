"use client";

import { useState } from "react";
import type { MistakesScope } from "../client/plan-client";
import { createApiPlanClient } from "../client/api-plan-client";
import { ReviewMistakesView } from "./review-mistakes-view";

/** Owns the real `PlanClient` for the Review mistakes screen, the same split the quiz pages use. */
export function ReviewMistakesPageClient({ scope, scopeName, exitHref }: { scope: MistakesScope; scopeName: string; exitHref: string }) {
  const [client] = useState(() => createApiPlanClient());
  return <ReviewMistakesView client={client} scope={scope} scopeName={scopeName} exitHref={exitHref} />;
}
