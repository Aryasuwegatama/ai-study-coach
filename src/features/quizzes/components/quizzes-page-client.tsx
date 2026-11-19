"use client";

import { useState } from "react";
import { createApiQuizzesClient } from "../client/api-quizzes-client";
import { QuizzesClientError } from "../client/quizzes-client";
import type { SetListItemResponse } from "../quizzes-schemas";
import { useQuizzesList } from "../hooks/use-quizzes-list";
import { DeleteQuizDialog } from "./delete-quiz-dialog";
import { QuizLibrary } from "./quiz-library";
import { QuizzesListError } from "./quizzes-list-error";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Owns the real `QuizzesClient` (T-12b; issue #49), the polling hook and
 * the delete dialog — the same split `materials-page-client.tsx` uses.
 */
export function QuizzesPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createApiQuizzesClient(spaceId));
  const { sets, loading, error, refresh } = useQuizzesList(client);
  const [deleteTarget, setDeleteTarget] = useState<SetListItemResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDeleted() {
    setActionError(null);
    await refresh();
  }

  function handleDeleteDialogClose(open: boolean) {
    if (!open) setDeleteTarget(null);
  }

  // The first load failed and nothing has loaded yet: replace the
  // library (and its endless skeleton) with a dedicated error state and
  // a manual retry (same pattern as `use-materials-list.ts`'s consumer).
  if (error && sets.length === 0 && !loading) {
    return <QuizzesListError message={error} onRetry={refresh} />;
  }

  return (
    <>
      <QuizLibrary
        spaceId={spaceId}
        quizzes={sets}
        loading={loading}
        actionError={actionError}
        onDelete={(quiz) => {
          setActionError(null);
          setDeleteTarget(quiz);
        }}
      />
      <DeleteQuizDialog
        quiz={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={handleDeleteDialogClose}
        client={client}
        onDeleted={() => void handleDeleted().catch((err) => {
          setActionError(err instanceof QuizzesClientError ? err.message : GENERIC_ERROR_MESSAGE);
        })}
      />
    </>
  );
}
