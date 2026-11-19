"use client";

import { useState } from "react";
import { ResultsView } from "@/features/attempts/components/results-view";
import { createExampleQuizzesClient } from "../client/example-quizzes-client";

/** Owns the example `QuizzesClient` for the results screen (issue #46),
 * the same split `quizzes-page-client.tsx` uses for the library. */
export function ResultsPageClient({ spaceId, setId, attemptId }: { spaceId: string; setId: string; attemptId: string }) {
  const [client] = useState(() => createExampleQuizzesClient());
  return <ResultsView spaceId={spaceId} setId={setId} attemptId={attemptId} client={client} />;
}
