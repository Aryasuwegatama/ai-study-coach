"use client";

import { useState } from "react";
import { AttemptView } from "@/features/attempts/components/attempt-view";
import { createExampleQuizzesClient } from "../client/example-quizzes-client";

/** Owns the example `QuizzesClient` for the attempt screen (issue #46),
 * the same split `quizzes-page-client.tsx` uses for the library. */
export function AttemptPageClient({ spaceId, setId }: { spaceId: string; setId: string }) {
  const [client] = useState(() => createExampleQuizzesClient());
  return <AttemptView spaceId={spaceId} setId={setId} client={client} />;
}
