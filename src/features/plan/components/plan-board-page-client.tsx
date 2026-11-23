"use client";

import { useState } from "react";
import { createApiPlanClient } from "../client/api-plan-client";
import { PlanBoardView } from "./plan-board-view";

/** Owns the real `PlanClient` for the Plan board screen, the same split as My Plan. */
export function PlanBoardPageClient() {
  const [client] = useState(() => createApiPlanClient());
  return <PlanBoardView client={client} />;
}
