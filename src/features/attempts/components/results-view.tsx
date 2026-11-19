"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizzesClientError, type QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import type { AttemptResult } from "../attempts-schemas";
import { AnswerReviewList } from "./answer-review-list";
import { ResultsTopicScores } from "./results-topic-scores";

/**
 * Quiz results and answer review (issue #46; Figma nodes 49:19321
 * results, 49:19512 answer review). "Retake" just links to the attempt
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

  useEffect(() => {
    let ignore = false;
    client
      .getAttempt(attemptId)
      .then((response) => {
        if (ignore) return;
        if (response.status !== "submitted" || !response.result) {
          setLoadError("This attempt hasn't been submitted yet.");
          return;
        }
        setResult(response.result);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setLoadError(err instanceof QuizzesClientError ? err.message : "Couldn't load these results. Try again.");
      });
    return () => {
      ignore = true;
    };
  }, [client, attemptId]);

  if (loadError) {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {loadError}
          </p>
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes`} />}>
            Return to quizzes
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-[20px]" />
        <Skeleton className="h-40 w-full rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
      </div>

      <Card className="rounded-[20px] p-6">
        <CardContent className="flex flex-col gap-4 p-0">
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-[2rem] leading-none font-semibold text-foreground">{result.percent}%</span>
            <span className="text-sm text-muted-foreground">
              {result.score} of {result.total} correct
            </span>
          </div>
          <Progress value={result.percent} />
          <p className="text-xs text-muted-foreground">
            Quiz score is not topic mastery — mastery uses your latest 10 eligible answers per topic over time.
          </p>
        </CardContent>
      </Card>

      <ResultsTopicScores topics={result.topics} />

      <AnswerReviewList questions={result.questions} client={client} />

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes`} />}>
          Return to quizzes
        </Button>
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/${setId}`} />}>
          Retake
        </Button>
      </div>
    </div>
  );
}
