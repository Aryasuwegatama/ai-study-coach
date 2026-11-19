"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizzesClientError, type ExampleAttemptResponse, type QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import { AttemptQuestionCard } from "./attempt-question-card";
import { AttemptQuestionNav } from "./attempt-question-nav";
import { SubmitConfirmationDialog } from "./submit-confirmation-dialog";

type AutosaveStatus = "idle" | "saving" | "saved" | "retrying" | "error";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  retrying: "Couldn't save, retrying…",
  error: "Couldn't save your answer. Check your connection and try again.",
};

/**
 * The quiz attempt screen (issue #46; Figma node 49:18898 MCQ, 72:6624
 * saved at first question, 71:6451 saved attempt/Resume, 49:19295
 * submit confirmation). One route covers a fresh attempt, Resume and
 * Retake — `client.startOrResumeAttempt` decides which.
 */
export function AttemptView({ spaceId, setId, client }: { spaceId: string; setId: string; client: QuizzesClient }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<ExampleAttemptResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    client
      .startOrResumeAttempt(setId)
      .then((response) => {
        if (ignore) return;
        setAttempt(response);
        const firstUnanswered = response.questions?.findIndex((question) => question.selectedIndex === null) ?? -1;
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setLoadError(err instanceof QuizzesClientError ? err.message : "Couldn't load this quiz. Try again.");
      });
    return () => {
      ignore = true;
    };
  }, [client, setId]);

  const questions = useMemo(() => attempt?.questions ?? [], [attempt]);
  const current = questions[currentIndex];
  const unansweredPositions = useMemo(
    () => questions.filter((question) => question.selectedIndex === null).map((question) => question.position),
    [questions],
  );

  async function saveAnswer(itemId: string, selectedIndex: number | null, retryCount = 0): Promise<void> {
    if (!attempt) return;
    setAutosaveStatus(retryCount > 0 ? "retrying" : "saving");
    try {
      const response = await client.saveAnswer(attempt.id, { itemId, selectedIndex });
      setAttempt(response);
      setAutosaveStatus("saved");
    } catch {
      if (retryCount < 1) {
        await saveAnswer(itemId, selectedIndex, retryCount + 1);
        return;
      }
      setAutosaveStatus("error");
    }
  }

  function handleSelect(selectedIndex: number) {
    if (!current) return;
    const itemId = current.itemId;
    // Optimistic local update so the selected option shows immediately,
    // without waiting for the simulated autosave round trip.
    setAttempt((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions?.map((question) => (question.itemId === itemId ? { ...question, selectedIndex } : question)) ?? null,
          }
        : prev,
    );
    void saveAnswer(itemId, selectedIndex);
  }

  function goTo(index: number) {
    setCurrentIndex(Math.min(Math.max(index, 0), questions.length - 1));
  }

  async function handleSubmit() {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await client.submitAttempt(attempt.id);
      router.push(`/spaces/${spaceId}/quizzes/${setId}/results/${result.id}`);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
    }
  }

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

  if (!attempt || !current) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          Question {currentIndex + 1} of {questions.length}
        </h2>
        <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-primary">
          EXAMPLE DATA
        </span>
      </div>

      <AttemptQuestionNav questions={questions} currentIndex={currentIndex} onSelect={goTo} />

      <Card className="rounded-[20px] p-6">
        <CardContent className="p-0">
          <AttemptQuestionCard key={current.itemId} question={current} onSelect={handleSelect} onAdvance={() => goTo(currentIndex + 1)} />
        </CardContent>
      </Card>

      <p aria-live="polite" className="h-4 text-xs text-muted-foreground">
        {AUTOSAVE_LABEL[autosaveStatus]}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={currentIndex === questions.length - 1}
            onClick={() => goTo(currentIndex + 1)}
          >
            Next
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes`} />}>
            Save &amp; exit
          </Button>
          <Button type="button" className="rounded-full" onClick={() => setSubmitOpen(true)}>
            Submit
          </Button>
        </div>
      </div>

      <SubmitConfirmationDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        unansweredPositions={unansweredPositions}
        submitting={submitting}
        submitError={submitError}
        onConfirm={() => void handleSubmit()}
      />
    </div>
  );
}
