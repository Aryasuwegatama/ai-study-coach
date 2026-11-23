"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QuizzesClientError, type QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import { MAX_REPORT_COMMENT, REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "@/features/reports/reports-schemas";
import type { ItemReport, QuestionResult } from "../attempts-schemas";

/**
 * Report an issue, on the Results answer review only (T-12b, issue #49;
 * Figma nodes 49:19940 "Report an issue" and 49:19965 "Report sent" — the
 * PRD wins on fields: the four reasons, an optional comment and a "Remove
 * from my practice" checkbox, not Figma's single free-text field). One
 * report per student per question, never edited or withdrawn in Core.
 */
export function ReportIssueDialog({
  question,
  open,
  onOpenChange,
  client,
  onReported,
}: {
  question: QuestionResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: QuizzesClient;
  onReported: (itemId: string, report: ItemReport) => void;
}) {
  const [reason, setReason] = useState<ReportReason>("incorrect_answer");
  const [comment, setComment] = useState("");
  const [removeFromPractice, setRemoveFromPractice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Re-sync the form when a different question opens the dialog —
  // adjusted during render, the same pattern `RenameTopicDialog` uses.
  const [prevItemId, setPrevItemId] = useState(question?.itemId ?? null);
  if ((question?.itemId ?? null) !== prevItemId) {
    setPrevItemId(question?.itemId ?? null);
    setReason("incorrect_answer");
    setComment("");
    setRemoveFromPractice(false);
    setError(null);
    setSent(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question || pending) return;
    setPending(true);
    setError(null);
    try {
      const report = await client.reportItem(question.itemId, {
        reason,
        comment: comment.trim().length > 0 ? comment.trim() : undefined,
        removeFromPractice,
      });
      onReported(question.itemId, { reason: report.reason, removedFromPractice: report.removedFromPractice });
      setSent(true);
    } catch (err) {
      setError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Report sent</DialogTitle>
              <DialogDescription>Thanks for letting us know. We&apos;ll look into this question.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" className="rounded-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Report an issue</DialogTitle>
              <DialogDescription>Let us know what&apos;s wrong with this question.</DialogDescription>
            </DialogHeader>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">What&apos;s the issue?</legend>
              <RadioGroup value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
                {REPORT_REASONS.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                    <RadioGroupItem value={value} disabled={pending} />
                    {REPORT_REASON_LABELS[value]}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-comment">Comment (optional)</Label>
              <textarea
                id="report-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={MAX_REPORT_COMMENT}
                rows={3}
                disabled={pending}
                className="rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={removeFromPractice} onCheckedChange={(checked) => setRemoveFromPractice(checked === true)} disabled={pending} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">Remove from my practice</span>
                <span className="text-xs text-muted-foreground">
                  This question won&apos;t appear in new quizzes or count toward mastery. Your past results stay as they are.
                </span>
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" className="gap-2 rounded-full" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Submit report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
