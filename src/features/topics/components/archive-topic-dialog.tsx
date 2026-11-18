"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TopicsClientError, topicsClient } from "../client/api-topics-client";
import type { TopicResponse } from "../topics-schemas";

/**
 * Reuses the "Delete material" confirmation pattern (no Figma design for
 * this; T-09c plan: "Reuse the existing patterns"), but archiving is
 * reversible (Restore), so the confirm action keeps the default button
 * styling rather than the destructive-red one delete dialogs use.
 * Wording checked against the quizzes service: set creation only
 * accepts `confirmed` topics, so an archived topic really is excluded
 * from new quizzes and flashcards.
 */
export function ArchiveTopicDialog({
  topic,
  open,
  onOpenChange,
  onArchived,
}: {
  topic: TopicResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: (topic: TopicResponse) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    if (!nextOpen) setError(undefined);
    onOpenChange(nextOpen);
  }

  async function handleArchive() {
    if (!topic || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const archived = await topicsClient.update(topic.id, { status: "archived" });
      onArchived(archived);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof TopicsClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &quot;{topic?.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            It won&apos;t be offered for new quizzes or flashcards. Its past results and mastery stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleArchive()} disabled={pending} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
