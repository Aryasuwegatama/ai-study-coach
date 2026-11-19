import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/class-names";
import type { QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import { OPTION_LETTERS, type ItemReport, type QuestionResult } from "../attempts-schemas";
import { ReportIssueDialog } from "./report-issue-dialog";

/**
 * Review answers (issue #46 → #49; Figma node 49:19512). Each question
 * shows the student's answer, the correct answer, the explanation, the
 * AI-generated label, "View source" — a native `<details>` disclosure
 * rather than a dialog, so every source stays reachable by keyboard with
 * no extra component — and a "Report issue" button (T-12b, one per
 * question, answer review only). An empty `sources` shows "Source
 * removed"; a question already reported (`question.report`, read back
 * after a reload) shows "Reported" instead of the button.
 */
export function AnswerReviewList({ questions, client }: { questions: QuestionResult[]; client: QuizzesClient }) {
  // Only reports made during this visit. The server's `question.report`
  // wins otherwise: Cache Components keeps this list mounted across
  // navigations, so state seeded once from props would go stale when the
  // results are fetched again (Codex review on #50).
  const [newReports, setNewReports] = useState<Record<string, ItemReport>>({});
  const [reportTarget, setReportTarget] = useState<QuestionResult | null>(null);

  function handleReported(itemId: string, report: ItemReport) {
    setNewReports((prev) => ({ ...prev, [itemId]: report }));
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-foreground">Review answers</h3>
      {questions.map((question, questionIndex) => {
        const report = newReports[question.itemId] ?? question.report;
        return (
        <Card key={question.itemId} className="rounded-[20px] p-5">
          <CardContent className="flex flex-col gap-3 p-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Question {questionIndex + 1}</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  question.isCorrect ? "bg-soft-green text-green" : "bg-destructive/10 text-destructive",
                )}
              >
                {question.isCorrect ? "Correct" : "Incorrect"}
              </span>
              <span className="rounded-full bg-soft-purple px-2.5 py-0.5 text-xs font-semibold text-purple">AI-generated</span>
            </div>

            <p className="font-medium text-foreground">{question.prompt}</p>

            <ul className="flex flex-col gap-2">
              {question.options.map((option, index) => {
                const isCorrectOption = index === question.correctIndex;
                const isSelected = index === question.selectedIndex;
                return (
                  <li
                    key={index}
                    className={cn(
                      "flex gap-3 rounded-xl border px-3 py-2 text-sm",
                      isCorrectOption
                        ? "border-green bg-soft-green text-green"
                        : isSelected
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border text-foreground",
                    )}
                  >
                    <span className="w-4 shrink-0 font-semibold">{OPTION_LETTERS[index]}</span>
                    <span className="min-w-0">
                      {option}
                      {isCorrectOption && <span className="ml-2 text-xs font-semibold">(Correct answer)</span>}
                      {isSelected && !isCorrectOption && <span className="ml-2 text-xs font-semibold">(Your answer)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>

            {question.explanation && <p className="text-sm text-muted-foreground">{question.explanation}</p>}

            {question.sources.length === 0 ? (
              <p className="text-xs text-muted-foreground">Source removed</p>
            ) : (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-primary underline underline-offset-2">View source</summary>
                <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                  {question.sources.map((source) => (
                    <div key={source.chunkId}>
                      <p className="font-medium text-foreground">
                        {source.materialName} · {source.pages}
                      </p>
                      <p>{source.excerpt}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div>
              {report ? (
                <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground">
                  Reported{report.removedFromPractice ? " · Removed from your practice" : ""}
                </span>
              ) : (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setReportTarget(question)}>
                  Report issue
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        );
      })}

      <ReportIssueDialog
        question={reportTarget}
        open={reportTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
        client={client}
        onReported={handleReported}
      />
    </div>
  );
}
