"use client";

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

/** "Submit this quiz?" (issue #46; redesign prototype `quiz-attempt.html`): lists the unanswered questions. */
export function SubmitConfirmationDialog({
  open,
  onOpenChange,
  unansweredPositions,
  submitting,
  submitError,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unansweredPositions: number[];
  submitting: boolean;
  submitError: string | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit this quiz?</AlertDialogTitle>
          <AlertDialogDescription>
            {unansweredPositions.length === 0
              ? "Every question is answered. "
              : `You haven't answered ${unansweredPositions.map((position) => `question ${position}`).join(", ")}. Unanswered questions count as incorrect. `}
            You can&apos;t change your answers after submitting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {submitError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep answering</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {submitting ? "Submitting…" : "Submit quiz"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
