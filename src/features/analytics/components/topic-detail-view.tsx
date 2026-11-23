import Link from "next/link";
import { ArrowLeft, Check, ListChecks, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { MASTERY_MIN_EVIDENCE, MASTERY_WINDOW, type TopicMasteryDetail } from "@/features/progress/progress-schemas";
import { cn } from "@/lib/class-names";
import { canPractise, formatAnsweredDate, pluralise, practiseHref, reviewTopicHref, spaceAnalyticsHref } from "../analytics-format";
import { AnalyticsAnswerStrip } from "./analytics-answer-strip";
import { AnalyticsExpandableList } from "./analytics-expandable-list";
import { AnalyticsMethodDialog } from "./analytics-method-dialog";
import { MistakesTile, TILE, TILE_NUMBER } from "./analytics-summary-tiles";
import { TopicMeter } from "./analytics-topics-card";
import { MasteryPill, NoMaterialPill } from "./mastery-pill";

/** The topic's result: its status, its own percentage (or how far it is from one) and the bar with the 60% mark. */
function MasteryTile({ detail, className }: { detail: TopicMasteryDetail; className?: string }) {
  const { mastery } = detail;
  const big =
    mastery.percent !== null
      ? `${mastery.percent}%`
      : mastery.status === "insufficient"
        ? `${mastery.counted} of ${MASTERY_MIN_EVIDENCE}`
        : null;
  const note =
    mastery.percent !== null
      ? `of the latest ${pluralise(mastery.counted, "question")}`
      : mastery.status === "insufficient"
        ? `Answer ${pluralise(mastery.needed, "more question")} to get a percentage.`
        : "Take a quiz that includes this topic.";

  return (
    <div className={cn(TILE, "col-span-2 border-border bg-card", className)}>
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
        Mastery
        <MasteryPill status={mastery.status} />
        {!detail.hasReadyMaterial && <NoMaterialPill />}
      </span>
      <span className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {big ? <span className={TILE_NUMBER}>{big}</span> : <span className="text-card-title text-foreground">Not tested yet</span>}
        <span className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
          <TopicMeter topic={mastery} className="w-full" />
          <span className="text-sm text-muted-foreground">{note}</span>
        </span>
      </span>
    </div>
  );
}

/** Correct or Incorrect among the counted answers (a count, with an icon as well as a colour). */
function AnswerCountTile({ correct, count, counted }: { correct: boolean; count: number; counted: number }) {
  const Icon = correct ? Check : X;
  return (
    <div className={cn(TILE, "border-border bg-card")}>
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className={cn("size-4", correct ? "text-green" : "text-destructive")} strokeWidth={2.5} aria-hidden="true" />
        {correct ? "Correct" : "Incorrect"}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className={TILE_NUMBER}>{count}</span>
        <span className="text-sm text-muted-foreground">of {counted} counted</span>
      </span>
    </div>
  );
}

/**
 * Topic detail (UI redesign, Arya, 2026-11-23), in the same layout as the
 * Analytics pages: tiles for the topic's mastery, its correct and incorrect
 * counted answers and its open mistakes; then the counted questions (newest
 * first, 6 then "Show all") beside the answer strip. The counting rules are
 * in the "How is this worked out?" dialog. `questions` are the counted ones
 * only, so what's shown is exactly what the percentage uses.
 */
export function TopicDetailView({ detail, timeZone }: { detail: TopicMasteryDetail; timeZone: string }) {
  const { mastery, questions, spaceId } = detail;
  const practise = canPractise({ status: mastery.status, hasReadyMaterial: detail.hasReadyMaterial });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div>
        <Button variant="ghost" nativeButton={false} render={<Link href={spaceAnalyticsHref(spaceId)} />}>
          <ArrowLeft aria-hidden="true" />
          Back to Analytics
        </Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Topic</p>
          <h2 className="text-section break-words text-foreground">{mastery.name}</h2>
          {!detail.hasReadyMaterial && (
            <p className="text-sm text-muted-foreground">No ready material to practise from. Past answers still count.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <AnalyticsMethodDialog activity={false} />
          {practise && (
            <Button nativeButton={false} render={<Link href={practiseHref(spaceId, mastery.topicId)} />}>
              <ListChecks aria-hidden="true" />
              Practise this topic
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {/* Not assessed: no "0 of 0 counted" tiles, the mastery tile takes their place. */}
        <MasteryTile detail={detail} className={cn(mastery.counted === 0 && "lg:col-span-4")} />
        {mastery.counted > 0 && (
          <>
            <AnswerCountTile correct count={mastery.correct} counted={mastery.counted} />
            <AnswerCountTile correct={false} count={mastery.counted - mastery.correct} counted={mastery.counted} />
          </>
        )}
        <MistakesTile mistakes={detail.mistakes} reviewHref={reviewTopicHref(mastery.topicId)} className="max-lg:col-span-2" />
      </div>

      {mastery.status === "not_assessed" ? (
        <Card className="gap-2 p-6 max-sm:p-4">
          <h3 className="text-card-title text-foreground">Counting the latest {MASTERY_WINDOW} questions</h3>
          <p className="text-muted-foreground">
            No questions answered yet. Take a quiz that includes this topic. After {MASTERY_MIN_EVIDENCE} answered questions
            it gets a percentage.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
          <StickyEndColumn>
            <Card className="gap-0 p-0">
              <header className="p-6 max-sm:p-4">
                <h3 className="flex items-center gap-2 text-card-title text-foreground">
                  Counting the latest {MASTERY_WINDOW} questions
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mastery.status === "insufficient"
                    ? `Answer ${pluralise(mastery.needed, "more question")} to get a percentage. Newest first.`
                    : `Your most recent answer to each question, newest first. ${questions.length} so far.`}
                </p>
              </header>
              <AnalyticsExpandableList total={questions.length} noun="questions" ordered>
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
              </AnalyticsExpandableList>
            </Card>
          </StickyEndColumn>
          <StickyEndColumn>
            <Card className="gap-4 p-6 max-sm:p-4">
              <div>
                <h3 className="text-card-title text-foreground">Latest counted answers</h3>
                <p className="mt-1 text-sm text-muted-foreground">The same answers as the list, newest first.</p>
              </div>
              <AnalyticsAnswerStrip questions={questions} timeZone={timeZone} />
            </Card>
          </StickyEndColumn>
        </div>
      )}
    </div>
  );
}
