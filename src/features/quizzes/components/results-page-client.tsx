"use client";

import { useState } from "react";
import { ResultsView } from "@/features/attempts/components/results-view";
import { createApiQuizzesClient } from "../client/api-quizzes-client";

/** Owns the real `QuizzesClient` for the results screen (T-12b; issue
 * #49), the same split `quizzes-page-client.tsx` uses for the library. */
export function ResultsPageClient({ spaceId, setId, attemptId }: { spaceId: string; setId: string; attemptId: string }) {
  const [client] = useState(() => createApiQuizzesClient(spaceId));
  return <ResultsView spaceId={spaceId} setId={setId} attemptId={attemptId} client={client} />;
}
