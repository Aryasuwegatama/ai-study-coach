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

/** Figma node 49:19295, "Submit confirmation" — lists unanswered
 * question numbers (issue #46). */
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
              ? "Every question is answered. You can't change your answers after submitting."
              : `You haven't answered question${unansweredPositions.length === 1 ? "" : "s"} ${unansweredPositions.join(", ")}. Unanswered questions count as incorrect, and you can't change your answers after submitting.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {submitError && <p className="text-sm font-medium text-destructive">{submitError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep answering</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Submit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
