import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/class-names";
import type { QuestionResult } from "../attempts-schemas";

/**
 * Review answers (issue #46; Figma node 49:19512). Each question shows
 * the student's answer, the correct answer, the explanation, the
 * AI-generated label and "View source" — a native `<details>` disclosure
 * rather than a dialog, so every source stays reachable by keyboard with
 * no extra component. An empty `sources` shows "Source removed".
 */
export function AnswerReviewList({ questions }: { questions: QuestionResult[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-foreground">Review answers</h3>
      {questions.map((question) => (
        <Card key={question.itemId} className="rounded-[20px] p-5">
          <CardContent className="flex flex-col gap-3 p-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Question {question.position}</span>
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
                      "rounded-xl border px-3 py-2 text-sm",
                      isCorrectOption
                        ? "border-green bg-soft-green text-green"
                        : isSelected
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border text-foreground",
                    )}
                  >
                    {option}
                    {isCorrectOption && <span className="ml-2 text-xs font-semibold">(Correct answer)</span>}
                    {isSelected && !isCorrectOption && <span className="ml-2 text-xs font-semibold">(Your answer)</span>}
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
