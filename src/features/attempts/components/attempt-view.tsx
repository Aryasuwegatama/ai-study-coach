"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
          <Button
            variant="outline"
            className="rounded-full"
            aria-disabled={exitState === "waiting"}
            nativeButton={false}
            render={<Link href={quizzesHref} />}
            onClick={(event) => void handleSaveAndExit(event)}
          >
            {exitState === "waiting" ? "Saving…" : exitState === "failed" ? "Exit without saving" : "Save & exit"}
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
