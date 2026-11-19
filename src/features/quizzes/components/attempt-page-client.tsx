"use client";

import { useState } from "react";
import { AttemptView } from "@/features/attempts/components/attempt-view";
import { createApiQuizzesClient } from "../client/api-quizzes-client";

/** Owns the real `QuizzesClient` for the attempt screen (T-12b; issue
 * #49), the same split `quizzes-page-client.tsx` uses for the library. */
export function AttemptPageClient({ spaceId, setId }: { spaceId: string; setId: string }) {
  const [client] = useState(() => createApiQuizzesClient(spaceId));
  return <AttemptView spaceId={spaceId} setId={setId} client={client} />;
}
