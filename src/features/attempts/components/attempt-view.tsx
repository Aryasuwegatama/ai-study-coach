"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ListChecks, Plus, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizzesClientError, type QuizzesClient } from "@/features/quizzes/client/quizzes-client";
import type { AttemptResponse } from "../attempts-schemas";
import { AttemptQuestionCard } from "./attempt-question-card";
import { AttemptQuestionNav } from "./attempt-question-nav";
import { SubmitConfirmationDialog } from "./submit-confirmation-dialog";

type AutosaveStatus = "idle" | "saving" | "saved" | "retrying" | "error";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  retrying: "Couldn't save, retrying…",
  error: "Couldn't save your answer. Check your connection and choose the answer again to retry.",
};

/**
 * The quiz attempt screen (issue #46; redesign prototype `quiz-attempt.html`).
 * One route covers a fresh attempt, Resume and Retake —
 * `client.startOrResumeAttempt` decides which. The quiz's title comes from
 * `getSet`, loaded alongside; the screen works without it.
 */
export function AttemptView({ spaceId, setId, client }: { spaceId: string; setId: string; client: QuizzesClient }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [loadError, setLoadError] = useState<{ code: string | null; message: string } | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loadRound, setLoadRound] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  // Save & exit: "waiting" while queued saves finish; "failed" when one
  // couldn't be saved, which turns the button into "Exit without saving"
  // so the student is never stuck on this page.
  const [exitState, setExitState] = useState<"idle" | "waiting" | "failed">("idle");

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
        setLoadError(
          err instanceof QuizzesClientError ? { code: err.code, message: err.message } : { code: null, message: "Couldn't load this quiz." },
        );
      });
    client
      .getSet(setId)
      .then((detail) => {
        if (!ignore) setTitle(detail.set.title);
      })
      .catch(() => {
        // The title is only a heading; the attempt works without it.
      });
    return () => {
      ignore = true;
    };
  }, [client, setId, loadRound]);

  const questions = useMemo(() => attempt?.questions ?? [], [attempt]);
  const current = questions[currentIndex];
  // Numbered by display order (1…N), not `position`, which the server counts from 0.
  const unansweredPositions = useMemo(
    () => questions.flatMap((question, index) => (question.selectedIndex === null ? [index + 1] : [])),
    [questions],
  );

  // Saves run one at a time, in the order the student chose (Codex review
  // on #48): with parallel saves, an older save's retry could land after
  // a newer one and overwrite it. `failedItemIds` holds questions whose
  // latest save failed both tries; choosing an answer again retries it.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const failedItemIds = useRef(new Set<string>());

  // Next 16 (Cache Components) hides this page with React `<Activity>`
  // when the student navigates away, instead of unmounting it, and shows
  // the same instance again on return — e.g. Retake after a submit comes
  // back to this URL with the submit dialog still open and spinning. The
  // cleanup runs when the page is hidden (`preserving-ui-state.md`) and
  // resets everything that belongs to that visit; on return, the effect
  // above runs again and loads a fresh `startOrResumeAttempt`.
  useLayoutEffect(() => {
    const failed = failedItemIds.current;
    return () => {
      setAttempt(null);
      setLoadError(null);
      setCurrentIndex(0);
      setAutosaveStatus("idle");
      setSubmitOpen(false);
      setSubmitting(false);
      setSubmitError(null);
      setExitState("idle");
      failed.clear();
    };
  }, []);

  async function saveWithRetry(attemptId: string, itemId: string, selectedIndex: number | null): Promise<boolean> {
    for (let tryCount = 0; tryCount < 2; tryCount++) {
      setAutosaveStatus(tryCount > 0 ? "retrying" : "saving");
      try {
        await client.saveAnswer(attemptId, { itemId, selectedIndex });
        return true;
      } catch {
        // Retried once below; reported as "error" after the second failure.
      }
    }
    return false;
  }

  function queueSave(itemId: string, selectedIndex: number | null) {
    if (!attempt) return;
    const attemptId = attempt.id;
    setAutosaveStatus("saving");
    setPendingSaves((count) => count + 1);
    // The save's response isn't applied to `attempt`: the local selections
    // are already up to date (optimistic), and a response could predate a
    // newer selection that's still waiting in the queue.
    saveQueue.current = saveQueue.current.then(async () => {
      const saved = await saveWithRetry(attemptId, itemId, selectedIndex);
      if (saved) failedItemIds.current.delete(itemId);
      else failedItemIds.current.add(itemId);
      const hasFailures = failedItemIds.current.size > 0;
      setAutosaveStatus(hasFailures ? "error" : "saved");
      // Choosing a failed answer again and saving it clears "Exit without saving".
      if (!hasFailures) setExitState((state) => (state === "failed" ? "idle" : state));
      setPendingSaves((count) => count - 1);
    });
  }

  /** Waits for every queued save; false if any answer still isn't saved. */
  async function flushSaves(): Promise<boolean> {
    await saveQueue.current;
    return failedItemIds.current.size === 0;
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
    queueSave(itemId, selectedIndex);
  }

  function goTo(index: number) {
    setCurrentIndex(Math.min(Math.max(index, 0), questions.length - 1));
  }

  const quizzesHref = `/spaces/${spaceId}/quizzes`;

  /**
   * Save & exit is a plain link. With nothing to wait for (every answer
   * already saved), or after a failed save ("Exit without saving"), the
   * link just navigates. Only while a save is still running does it hold
   * the navigation, wait for the queue, and then go — resetting the label
   * first, so "Saving…" covers the save itself, never the page load.
   */
  async function handleSaveAndExit(event: MouseEvent<HTMLElement>) {
    if (exitState === "failed") return;
    if (exitState === "waiting") {
      event.preventDefault();
      return;
    }
    if (pendingSaves === 0 && failedItemIds.current.size === 0) return;
    event.preventDefault();
    setExitState("waiting");
    if (await flushSaves()) {
      setExitState("idle");
      router.push(quizzesHref);
      return;
    }
    setExitState("failed");
  }

  async function handleSubmit() {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError(null);
    // Submit scores what the server has saved, so every pending save must
    // land first (Codex review on #48).
    if (!(await flushSaves())) {
      setSubmitting(false);
      setSubmitError("Some answers couldn't be saved. Choose them again, then submit.");
      return;
    }
    try {
      const result = await client.submitAttempt(attempt.id);
      router.push(`/spaces/${spaceId}/quizzes/${setId}/results/${result.id}`);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (loadError?.code === "SET_NO_ACTIVE_QUESTIONS") {
    return (
      <Card className="mt-6 items-center gap-4 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-card-title text-foreground">No questions available</h2>
        <p className="max-w-[42rem] text-muted-foreground">
          All questions in this quiz have been removed from future practice. You can create a new quiz from confirmed topics.
        </p>
        <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
          <Plus aria-hidden="true" />
          Create quiz
        </Button>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card role="alert" className="mt-6 gap-4 p-6 max-sm:p-4">
        <h2 className="text-card-title text-foreground">We couldn&apos;t load this quiz</h2>
        <p className="text-muted-foreground">{loadError.message} Check your connection and try again.</p>
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

  if (!attempt || !current) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy="true">
        <p className="sr-only" role="status">
          Loading this quiz.
        </p>
        <Skeleton className="h-8 w-64 max-w-full" aria-hidden="true" />
        <Card className="gap-4 p-6" aria-hidden="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-4/5" />
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </Card>
      </div>
    );
  }

  const selected = current.selectedIndex !== null;

  return (
    <section aria-labelledby="attempt-title" className="mt-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="attempt-title" className="text-section break-words text-foreground">
            {title ?? "Quiz"}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {questions.length} multiple-choice question{questions.length === 1 ? "" : "s"} · Answers shown after submission
          </p>
        </div>
        <Button
          variant="outline"
          aria-disabled={exitState === "waiting"}
          nativeButton={false}
          render={<Link href={quizzesHref} />}
          onClick={(event) => void handleSaveAndExit(event)}
        >
          {exitState === "waiting" ? "Saving…" : exitState === "failed" ? "Exit without saving" : "Save & exit"}
        </Button>
      </header>

      {exitState === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>Some answers couldn&apos;t be saved</AlertTitle>
          <AlertDescription>Choose them again to retry. If you leave now, your latest changes may be lost.</AlertDescription>
        </Alert>
      )}

      <AttemptQuestionNav questions={questions} currentIndex={currentIndex} onSelect={goTo} />

      <Card className="gap-5 p-6 max-sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="question-heading" className="text-card-title text-foreground">
            Question {currentIndex + 1} of {questions.length}
          </h3>
          <Badge tone="purple">{current.topicName}</Badge>
        </div>
        <AttemptQuestionCard key={current.itemId} question={current} onSelect={handleSelect} onAdvance={() => goTo(currentIndex + 1)} />
        <p className="text-sm text-muted-foreground">Choose one answer. You can change it before submitting.</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Button type="button" variant="outline" disabled={currentIndex === questions.length - 1} onClick={() => goTo(currentIndex + 1)}>
              Next
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          {selected && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Check className="size-4 text-green" aria-hidden="true" />
              Answer selected
            </span>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {AUTOSAVE_LABEL[autosaveStatus] || "Answers save automatically."}
        </p>
        <Button type="button" onClick={() => setSubmitOpen(true)}>
          Submit quiz
        </Button>
      </div>

      <SubmitConfirmationDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        unansweredPositions={unansweredPositions}
        submitting={submitting}
        submitError={submitError}
        onConfirm={() => void handleSubmit()}
      />
    </section>
  );
}
