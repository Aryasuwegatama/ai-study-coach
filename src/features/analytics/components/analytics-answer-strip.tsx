import { Check, X } from "lucide-react";
import { MASTERY_WINDOW, type CountedQuestion } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { formatAnsweredDate, pluralise } from "../analytics-format";

const SLOT = "grid aspect-square min-w-0 place-items-center rounded-sm border";
const CORRECT = "border-green bg-soft-green text-green";
const INCORRECT = "border-destructive bg-soft-red text-destructive";
const OPEN = "border-dashed border-border-strong";

function ResultIcon({ correct, className }: { correct: boolean; className?: string }) {
  const Icon = correct ? Check : X;
  return <Icon className={cn("size-4", className)} strokeWidth={2.5} aria-hidden="true" />;
}

/**
 * "Latest counted answers" (`.answer-strip` in the redesign prototype): one
 * square per counted question, newest first, up to 10. Each square has an
 * icon as well as a colour, and empty slots are dashed. The same answers are
 * listed below it on the page; screen readers get them from the table here.
 */
export function AnalyticsAnswerStrip({ questions, timeZone }: { questions: CountedQuestion[]; timeZone: string }) {
  const correct = questions.filter((q) => q.isCorrect).length;
  const incorrect = questions.length - correct;
  const open = Math.max(0, MASTERY_WINDOW - questions.length);

  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex max-w-[32rem] flex-col gap-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Newest</span>
          <span>Oldest</span>
        </div>
        <ol className="grid grid-cols-10 gap-1">
          {questions.map((question) => (
            <li key={question.itemId} className={cn(SLOT, question.isCorrect ? CORRECT : INCORRECT)}>
              <ResultIcon correct={question.isCorrect} />
            </li>
          ))}
          {Array.from({ length: open }, (_, index) => (
            <li key={`open-${index}`} className={cn(SLOT, OPEN)} />
          ))}
        </ol>
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <li className="inline-flex items-center gap-2">
          <span className={cn(SLOT, CORRECT, "size-5 rounded-[0.25rem]")}>
            <ResultIcon correct className="size-3.5" />
          </span>
          Correct <span className="font-semibold tabular-nums">{correct}</span>
        </li>
        <li className="inline-flex items-center gap-2">
          <span className={cn(SLOT, INCORRECT, "size-5 rounded-[0.25rem]")}>
            <ResultIcon correct={false} className="size-3.5" />
          </span>
          Incorrect <span className="font-semibold tabular-nums">{incorrect}</span>
        </li>
        {open > 0 && (
          <li className="inline-flex items-center gap-2">
            <span className={cn(SLOT, OPEN, "size-5 rounded-[0.25rem]")} />
            Open slot <span className="font-semibold tabular-nums">{open}</span>
          </li>
        )}
      </ul>
      {open > 0 && (
        <p className="text-sm text-muted-foreground">
          {pluralise(open, "open slot")}: answering {pluralise(open, "more question")} in this topic fills{" "}
          {open === 1 ? "it" : "them"}. After that, only your latest {MASTERY_WINDOW} questions count.
        </p>
      )}
      <div className="sr-only">
        <table>
          <caption>Latest counted answers, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Result</th>
              <th scope="col">Answered</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question, index) => (
              <tr key={question.itemId}>
                <th scope="row">{index === 0 ? "1 (newest)" : index + 1}</th>
                <td>{question.isCorrect ? "Correct" : "Incorrect"}</td>
                <td>{formatAnsweredDate(question.answeredAt, timeZone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
