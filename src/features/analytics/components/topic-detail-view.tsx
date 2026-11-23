import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { MASTERY_MIN_EVIDENCE, MASTERY_WINDOW, type TopicMasteryDetail } from "@/features/progress/progress-schemas";
import { formatAnsweredDate, pluralise, spaceAnalyticsHref } from "../analytics-format";
import { AnalyticsAnswerStrip } from "./analytics-answer-strip";
import { AnalyticsNote } from "./analytics-note";
import { TopicStatusLine } from "./mastery-pill";
import { TopicActions } from "./topic-actions";

const RULES = [
  { title: `Latest ${MASTERY_WINDOW} questions`, body: "Only your most recent answer to each question counts." },
  {
    title: `${MASTERY_MIN_EVIDENCE} needed for a percentage`,
    body: `With 1 to ${MASTERY_MIN_EVIDENCE - 1} answered questions the topic shows “Not enough evidence”.`,
  },
  { title: "Below 60% is Weak", body: "60% or above is On track." },
];

/**
 * Topic detail (redesign prototype `topic-detail.html`): the status, this
 * topic's own percentage when it has one, the latest counted answers as a
 * strip and as a list (newest first), and what to do next. `questions` are
 * the counted ones only (the API's latest answer per question, newest 10),
 * so what's shown is exactly what the percentage uses.
 *
 * The prototype's "Mastery after each quiz" chart is left out: there is no
 * per-quiz history behind it yet (PRD Section 2, Analytics row).
 */
export function TopicDetailView({ detail, timeZone }: { detail: TopicMasteryDetail; timeZone: string }) {
  const { mastery, questions, spaceId } = detail;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div>
        <Button variant="ghost" nativeButton={false} render={<Link href={spaceAnalyticsHref(spaceId)} />}>
          <ArrowLeft aria-hidden="true" />
          Back to Analytics
        </Button>
      </div>

      <Card className="gap-4 p-6 max-sm:p-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Topic</p>
            <h2 className="text-section break-words text-foreground">{mastery.name}</h2>
            <TopicStatusLine topic={mastery} hasReadyMaterial={detail.hasReadyMaterial} />
          </div>
          {mastery.percent !== null && (
            <div className="sm:text-right">
              <p className="text-page leading-tight font-semibold tabular-nums text-foreground">{mastery.percent}%</p>
              <p className="text-sm text-muted-foreground">
                {mastery.correct} of {mastery.counted} correct
              </p>
            </div>
          )}
        </header>
        <TopicActions
          spaceId={spaceId}
          topicId={mastery.topicId}
          status={mastery.status}
          hasReadyMaterial={detail.hasReadyMaterial}
          mistakes={detail.mistakes}
          emphasis="page"
        />
        <AnalyticsNote />
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
        <StickyEndColumn className="flex flex-col gap-6">
          {mastery.status === "not_assessed" ? (
            <Card className="gap-2 p-6 max-sm:p-4">
              <h3 className="text-card-title text-foreground">Counting the latest {MASTERY_WINDOW} questions</h3>
              <p className="text-muted-foreground">
                No questions answered yet. Take a quiz that includes this topic. After {MASTERY_MIN_EVIDENCE} answered
                questions it gets a percentage.
              </p>
            </Card>
          ) : (
            <>
              <Card className="gap-4 p-6 max-sm:p-4">
                <div>
                  <h3 className="text-card-title text-foreground">Latest counted answers</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mastery.correct} correct and {mastery.counted - mastery.correct} incorrect, newest first. These are the
                    same answers as the list below.
                  </p>
                </div>
                <AnalyticsAnswerStrip questions={questions} timeZone={timeZone} />
              </Card>

              <Card className="gap-0 p-0">
                <header className="p-6 max-sm:p-4">
                  <h3 className="text-card-title text-foreground">Counting the latest {MASTERY_WINDOW} questions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mastery.status === "insufficient"
                      ? `Answer ${pluralise(mastery.needed, "more question")} to get a percentage. Newest first.`
                      : `Your most recent answer to each question, newest first. ${questions.length} so far.`}
                  </p>
                </header>
                <ol>
                  {questions.map((question, index) => (
                    <li key={question.itemId} className="flex items-start gap-3 border-t border-border px-6 py-4 max-sm:px-4">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground tabular-nums"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words text-foreground">{question.prompt}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {question.isCorrect ? (
                            <Badge tone="green">
                              <Check aria-hidden="true" />
                              Correct
                            </Badge>
                          ) : (
                            <Badge tone="red">
                              <X aria-hidden="true" />
                              Incorrect
                            </Badge>
                          )}
                          <span className="text-sm text-muted-foreground">
                            Answered {formatAnsweredDate(question.answeredAt, timeZone)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          )}
        </StickyEndColumn>

        <StickyEndColumn>
          <Card className="gap-4 p-6 max-sm:p-4">
            <h3 className="text-card-title text-foreground">How this topic is counted</h3>
            <ul className="flex flex-col gap-4">
              {RULES.map((rule) => (
                <li key={rule.title} className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{rule.title}</span>
                  <span className="text-sm text-muted-foreground">{rule.body}</span>
                </li>
              ))}
            </ul>
          </Card>
        </StickyEndColumn>
      </div>
    </div>
  );
}
