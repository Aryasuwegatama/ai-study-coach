"use client";

import { useState } from "react";
import { createExampleQuizzesClient } from "../client/example-quizzes-client";
import { QuizSetupForm } from "./quiz-setup-form";

/** Owns the example `QuizzesClient` for the setup screen (issue #46),
 * the same split `quizzes-page-client.tsx` uses for the library. */
export function QuizSetupPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createExampleQuizzesClient());
  return <QuizSetupForm spaceId={spaceId} client={client} />;
}
