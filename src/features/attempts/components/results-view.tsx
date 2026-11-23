"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizzesClientError, type QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import type { AttemptResult } from "../attempts-schemas";
import { AnswerReviewList } from "./answer-review-list";
import { ResultsTopicScores } from "./results-topic-scores";

/**
 * Quiz results and answer review (issue #46; redesign prototype
 * `quiz-results.html`): the score and the score by topic side by side,
 * then every question with its answers, explanation and source. "Retake" just links to the attempt
 * route: `AttemptView`'s own `startOrResumeAttempt` call already starts
 * a new, shuffled attempt whenever the latest one is submitted, so
 * there's nothing extra to do here first.
 */
export function ResultsView({
  spaceId,
  setId,
  attemptId,
  client,
}: {
  spaceId: string;
  setId: string;
  attemptId: string;
  client: QuizzesClient;
}) {
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notSubmitted, setNotSubmitted] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [loadRound, setLoadRound] = useState(0);

  useEffect(() => {
    let ignore = false;
    client
      .getAttempt(attemptId)
      .then((response) => {
        if (ignore) return;
        if (response.status !== "submitted" || !response.result) {
          setNotSubmitted(true);
          return;
        }
        setResult(response.result);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setLoadError(err instanceof QuizzesClientError ? err.message : "Couldn't load these results.");
      });
    client
      .getSet(setId)
      .then((detail) => {
        if (!ignore) setTitle(detail.set.title);
      })
      .catch(() => {
        // The title is only a heading; the results work without it.
      });
    return () => {
      ignore = true;
    };
  }, [client, attemptId, setId, loadRound]);

  const quizzesHref = `/spaces/${spaceId}/quizzes`;
  const attemptHref = `/spaces/${spaceId}/quizzes/${setId}`;

  if (notSubmitted) {
    return (
      <Alert variant="info" className="mt-6">
        <Info aria-hidden="true" />
        <AlertTitle>Finish your quiz to see results</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          Answers, explanations and sources stay hidden until you submit.
          <Button variant="outline" nativeButton={false} render={<Link href={attemptHref} />}>
            Resume quiz
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loadError) {
    return (
      <Card role="alert" className="mt-6 gap-4 p-6 max-sm:p-4">
        <h2 className="text-card-title text-foreground">We couldn&apos;t load these results</h2>
        <p className="text-muted-foreground">{loadError} Check your connection and try again.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoadError(null);
              setLoadRound((round) => round + 1);
            }}
          >
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
          <Button variant="ghost" nativeButton={false} render={<Link href={quizzesHref} />}>
            Return to quizzes
          </Button>
        </div>
      </Card>
    );
  }

  if (!result) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy="true">
        <p className="sr-only" role="status">
          Loading these results.
        </p>
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" aria-hidden="true" />
      </div>
    );
  }

  return (
    <section aria-labelledby="results-title" className="mt-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="results-title" className="text-section break-words text-foreground">
              {title ?? "Quiz"}
            </h2>
            <Badge tone="green">Submitted</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">Quiz results</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={quizzesHref} />}>
            Return to quizzes
          </Button>
          <Button nativeButton={false} render={<Link href={attemptHref} />}>
            <RotateCcw aria-hidden="true" />
            Retake quiz
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <Card className="gap-3 p-6 max-sm:p-4">
          <h3 className="text-card-title text-foreground">Your score</h3>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-page leading-tight font-semibold tabular-nums text-foreground">{result.percent}%</span>
            <span className="text-muted-foreground">
              {result.score} of {result.total} correct
            </span>
          </p>
          <LabelledProgressBar value={result.score} max={result.total} label={`${result.percent}% correct in this attempt`} />
          <p className="text-sm text-muted-foreground">
            This is your quiz score. Topic mastery uses your latest 10 eligible scored questions per topic across attempts.
          </p>
        </Card>
        <ResultsTopicScores topics={result.topics} />
      </div>

      <AnswerReviewList questions={result.questions} client={client} />
    </section>
  );
}
