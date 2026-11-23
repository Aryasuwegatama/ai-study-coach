import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MASTERY_MIN_EVIDENCE, MASTERY_WINDOW, type TopicMasteryDetail } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { formatAnsweredDate, masteryDetail, pluralise, spaceAnalyticsHref } from "../analytics-format";
import { MasteryPill, NoMaterialPill } from "./mastery-pill";
import { TopicActions } from "./topic-actions";

const PILL = "inline-flex h-7 w-fit shrink-0 items-center rounded-full px-3 text-xs font-semibold";

/**
 * Topic detail (Figma 65:43925, and 65:44284 for not enough evidence): the
 * status, the questions that count towards it, newest first, and what to do
 * next. `questions` are the counted ones only (the API's latest answer per
 * question, newest 10), so what's listed is exactly what the percentage uses.
 */
export function TopicDetailView({ detail, timeZone }: { detail: TopicMasteryDetail; timeZone: string }) {
  const { mastery, questions, spaceId } = detail;

  return (
    <div className="flex flex-col gap-6">
      <Link href={spaceAnalyticsHref(spaceId)} className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Analytics
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">{mastery.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <MasteryPill status={mastery.status} />
          {!detail.hasReadyMaterial && <NoMaterialPill />}
          <span className="text-sm text-muted-foreground">{masteryDetail(mastery)}</span>
        </div>
        <TopicActions spaceId={spaceId} topicId={mastery.topicId} status={mastery.status} hasReadyMaterial={detail.hasReadyMaterial} mistakes={detail.mistakes} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="counted-heading">
        <h2 id="counted-heading" className="text-xl font-semibold text-foreground">
          Questions counted
        </h2>
        {mastery.status === "not_assessed" ? (
          <p className="text-sm text-muted-foreground">
            No questions answered yet. Take a quiz that includes this topic. After {MASTERY_MIN_EVIDENCE} answered questions you get a score.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {mastery.status === "insufficient"
                ? `Answer ${pluralise(mastery.needed, "more question")} to get a score.`
                : `Counting the latest ${MASTERY_WINDOW} questions, your most recent answer to each.`}
            </p>
            <ul className="flex flex-col gap-3">
              {questions.map((question) => (
                <li key={question.itemId}>
                  <Card className="rounded-[20px] p-5">
                    <CardContent className="flex flex-col gap-2 p-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <p className="min-w-0 text-sm font-medium text-foreground">{question.prompt}</p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={cn(PILL, question.isCorrect ? "bg-soft-green text-green" : "bg-soft-amber text-amber")}>
                          {question.isCorrect ? "Correct" : "Incorrect"}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatAnsweredDate(question.answeredAt, timeZone)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
