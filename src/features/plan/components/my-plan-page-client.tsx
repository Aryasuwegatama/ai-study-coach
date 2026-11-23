"use client";

import { useState } from "react";
import { createApiPlanClient } from "../client/api-plan-client";
import { MyPlanView } from "./my-plan-view";

/** Owns the real `PlanClient` for the My Plan screen, the same split the quiz pages use. */
export function MyPlanPageClient() {
  const [client] = useState(() => createApiPlanClient());
  return <MyPlanView client={client} />;
}
