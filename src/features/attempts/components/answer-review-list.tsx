import { useState } from "react";
import { Check, ChevronDown, CircleCheck, CircleX, Flag, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <section aria-labelledby="review-answers-title" className="flex flex-col gap-4">
      <div>
        <h3 id="review-answers-title" className="text-section text-foreground">
          Review answers
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">See your choices, correct answers and explanations.</p>
      </div>
      <ol className="flex flex-col gap-4">
        {questions.map((question, questionIndex) => {
          const report = newReports[question.itemId] ?? question.report;
          const unanswered = question.selectedIndex === null;
          const titleId = `review-${question.itemId}-title`;
          return (
            <li key={question.itemId}>
              <Card className="gap-4 p-6 max-sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 id={titleId} className="text-sm font-semibold tracking-normal text-foreground">
                    Question {questionIndex + 1}
                  </h4>
                  {question.isCorrect ? (
                    <Badge tone="green">
                      <Check aria-hidden="true" />
                      Correct
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      <X aria-hidden="true" />
                      {unanswered ? "Not answered" : "Incorrect"}
                    </Badge>
                  )}
                  <Badge tone="purple">{question.topicName}</Badge>
                  <Badge tone="neutral">
                    <Sparkles aria-hidden="true" />
                    AI-generated
                  </Badge>
                </div>

                <p className="font-semibold break-words text-foreground">{question.prompt}</p>

                <ul className="flex flex-col gap-2">
                  {question.options.map((option, index) => {
                    const isCorrectOption = index === question.correctIndex;
                    const isSelected = index === question.selectedIndex;
                    const label = isCorrectOption && isSelected ? "Correct answer · Your answer" : isCorrectOption ? "Correct answer" : isSelected ? "Your answer" : null;
                    return (
                      <li
                        key={index}
                        className={cn(
                          "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-foreground",
                          isCorrectOption
                            ? "border-green bg-soft-green shadow-[inset_0_0_0_1px_var(--green)]"
                            : isSelected
                              ? "border-destructive bg-soft-red shadow-[inset_0_0_0_1px_var(--destructive)]"
                              : "border-border bg-card",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
                            isCorrectOption
                              ? "border-green bg-green text-primary-foreground"
                              : isSelected
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-input",
                          )}
                        >
                          {OPTION_LETTERS[index]}
                        </span>
                        <span className="min-w-[12rem] flex-1 break-words">
                          <span className="sr-only">{OPTION_LETTERS[index]}. </span>
                          {option}
                        </span>
                        {label && (
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 text-sm font-semibold",
                              isCorrectOption ? "text-green" : "text-destructive",
                            )}
                          >
                            {isCorrectOption ? <CircleCheck className="size-4" aria-hidden="true" /> : <CircleX className="size-4" aria-hidden="true" />}
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {question.explanation && (
                  <div className="rounded-lg bg-secondary p-4">
                    <h5 className="text-sm font-semibold text-foreground">Explanation</h5>
                    <p className="mt-1 text-foreground">{question.explanation}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  {question.sources.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Source removed. Your submitted score and answer review are kept.</p>
                  ) : (
                    <details className="group min-w-0 flex-1">
                      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                        View source
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm">
                        {question.sources.map((source) => (
                          <div key={source.chunkId}>
                            <p className="font-semibold break-words text-foreground">
                              {source.materialName} · {source.pages}
                            </p>
                            <p className="mt-1 text-muted-foreground">{source.excerpt}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {report ? (
                    <Badge tone="neutral">Reported{report.removedFromPractice ? " · Removed from your practice" : ""}</Badge>
                  ) : (
                    <Button type="button" variant="outline" aria-describedby={titleId} onClick={() => setReportTarget(question)}>
                      <Flag aria-hidden="true" />
                      Report issue
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <ReportIssueDialog
        question={reportTarget}
        open={reportTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
        client={client}
        onReported={handleReported}
        questionNumber={reportTarget ? questions.indexOf(reportTarget) + 1 : null}
      />
    </section>
  );
}
