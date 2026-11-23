"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SET_TITLE_MAX, type SetListItemResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";

/**
 * Rename a quiz (UI redesign, Arya, 2026-11-23): the name is the only thing
 * a student can change. Same layout as `RenameTopicDialog`. Its results,
 * questions and topics stay as they are.
 */
export function RenameQuizDialog({
  quiz,
  open,
  onOpenChange,
  client,
  onRenamed,
}: {
  quiz: SetListItemResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: QuizzesClient;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(quiz?.title ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Re-sync the field when a different quiz opens the dialog (adjusted during render, as in RenameTopicDialog).
  const [prevQuizId, setPrevQuizId] = useState(quiz?.id ?? null);
  if ((quiz?.id ?? null) !== prevQuizId) {
    setPrevQuizId(quiz?.id ?? null);
    setName(quiz?.title ?? "");
    setError(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!quiz || pending) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Give this quiz a name.");
      return;
    }
    if (trimmed.length > SET_TITLE_MAX) {
      setError(`Keep the name to ${SET_TITLE_MAX} characters or fewer.`);
      return;
    }

    setPending(true);
    setError(undefined);
    try {
      await client.renameSet(quiz.id, trimmed);
      onRenamed();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename quiz</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-quiz-name">Quiz name</Label>
            <Input
              id="rename-quiz-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={SET_TITLE_MAX}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby="rename-quiz-help"
              autoFocus
            />
            <p id="rename-quiz-help" className="text-sm text-muted-foreground">
              Up to {SET_TITLE_MAX} characters. Your results and questions stay the same.
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
