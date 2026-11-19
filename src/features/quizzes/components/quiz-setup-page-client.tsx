"use client";

import { useState } from "react";
import { createApiQuizzesClient } from "../client/api-quizzes-client";
import { QuizSetupForm } from "./quiz-setup-form";

/** Owns the real `QuizzesClient` for the setup screen (T-12b; issue #49),
 * the same split `quizzes-page-client.tsx` uses for the library. The form
 * itself also talks to the Materials and Topics clients directly (gap 2). */
export function QuizSetupPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createApiQuizzesClient(spaceId));
  return <QuizSetupForm spaceId={spaceId} client={client} />;
}
