"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Info, Loader2, RotateCcw, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { OPTION_LETTERS } from "@/features/attempts/attempts-schemas";
import { pluralise } from "@/features/analytics/analytics-format";
import type { CheckResult, MistakeQuestion, MistakesResponse } from "@/features/revision/revision-schemas";
import { cn } from "@/lib/class-names";
import { PlanClientError, type MistakesScope, type PlanClient } from "../client/plan-client";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const messageOf = (error: unknown) => (error instanceof PlanClientError ? error.message : GENERIC_ERROR_MESSAGE);

/** `loadId` changes with every load, so a session never outlives the data it was built from. */
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: MistakesResponse; loadId: number };

/**
 * Review mistakes (T-15; redesign prototype `review-mistakes.html`): re-answer
 * questions the student got wrong, whenever they choose. Loads the list on
 * mount (and again after "Review more"), so it is always current even when
 * this route was kept mounted by Cache Components. `exitHref` is where Exit
 * and "Back" go; `scopeName` names the topic or space, and `contextName` the
 * space a topic belongs to.
 */
export function ReviewMistakesView({
  client,
  scope,
  scopeName,
  contextName,
  exitHref,
}: {
  client: PlanClient;
  scope: MistakesScope;
  scopeName: string;
  contextName?: string;
  exitHref: string;
}) {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const loads = useRef(0);

  // Runs on mount, after "Review more", and again whenever this route becomes visible (Cache Components
  // keeps a hidden route mounted and re-runs its effects), so a return visit always starts from fresh data.
  useEffect(() => {
    let ignore = false;
    const loadId = ++loads.current;
    client
      .listMistakes(scope)
      .then((data) => {
        if (!ignore) setState({ status: "ready", data, loadId });
      })
      .catch((error: unknown) => {
        if (!ignore) setState({ status: "error", message: messageOf(error) });
      });
    return () => {
      ignore = true;
    };
    // `scope` is a new object every render; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, round, "topicId" in scope ? scope.topicId : scope.spaceId]);

  function reload() {
    setState({ status: "loading" });
    setRound((r) => r + 1);
  }

  const total = state.status === "ready" ? state.data.total : null;
  const head = (
    <header className="mb-6">
      <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Review mistakes</p>
      <h1 className="text-page-mobile break-words text-foreground sm:text-page">{scopeName}</h1>
      <p className="mt-2 text-muted-foreground">
        {contextName && `${contextName} · `}
        {total !== null && `${pluralise(total, "mistake")}. `}
        Answer each question again. A correct answer removes it from your mistakes.
      </p>
    </header>
  );

  let body: React.ReactNode;
  if (state.status === "loading") {
    body = (
      <Card className="gap-4 p-6" aria-busy="true">
        <p className="sr-only" role="status">
          Loading your mistakes.
        </p>
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-6 w-4/5" />
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    );
  } else if (state.status === "error") {
    body = (
      <Card role="alert" className="gap-4 p-6">
        <h2 className="text-card-title text-foreground">We couldn&apos;t load your mistakes</h2>
        <p className="text-muted-foreground">{state.message} Your mistakes are still saved.</p>
        <div>
          <Button type="button" variant="outline" onClick={reload}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </Card>
    );
  } else if (state.data.items.length === 0) {
    body = (
      <Card className="items-center gap-4 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-soft-green text-green">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-card-title text-foreground">No mistakes to review</h2>
        <p className="max-w-[42rem] text-muted-foreground">
          You have no open mistakes in {scopeName}. Questions you get wrong in a quiz appear here.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href={exitHref} />}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      </Card>
    );
  } else {
    body = (
      <ReviewSession
        key={state.loadId}
        client={client}
        items={state.data.items}
        total={state.data.total}
        scopeName={contextName ?? scopeName}
        exitHref={exitHref}
        onMore={reload}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[48rem]">
      {head}
      {body}
    </div>
  );
}

function ReviewSession({
  client,
  items,
  total,
  scopeName,
  exitHref,
  onMore,
}: {
  client: PlanClient;
  items: MistakeQuestion[];
  total: number;
  scopeName: string;
  exitHref: string;
  onMore: () => void;
}) {
  const router = useRouter();
  // One key per question, made once: a double click or a retry of the same check can never count twice.
  const [requestKeys] = useState(() => items.map(() => crypto.randomUUID()));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const [wrong, setWrong] = useState(0);
  /** Each checked question's result, in order, for the summary strip. */
  const [outcomes, setOutcomes] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inFlight = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const current = items[index];
  const unchecked = selected !== null && result === null;

  // After a check, move focus to Next so a keyboard user can carry on; the result itself is announced by its live region.
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  async function check() {
    if (selected === null || result || inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const checked = await client.checkMistake(current.id, { requestKey: requestKeys[index], selectedIndex: selected });
      setResult(checked);
      setOutcomes((list) => [...list, checked.outcome === "correct"]);
      if (checked.outcome === "correct") setRight((n) => n + 1);
      else setWrong((n) => n + 1);
    } catch (error) {
      setCheckError(messageOf(error));
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }

  function next() {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setSelected(null);
      setResult(null);
      setCheckError(null);
      return;
    }
    setDone(true);
    // Mistakes changed: have the server pages re-read their numbers.
    router.refresh();
  }

  function handleExit(event: React.MouseEvent<HTMLElement>) {
    if (!unchecked) return;
    event.preventDefault();
    setLeaveOpen(true);
  }

  if (done) {
    const remaining = total - items.length;
    return (
      <Card className="items-center gap-4 px-6 py-10 text-center max-sm:px-4">
        <span className="flex size-12 items-center justify-center rounded-lg bg-soft-green text-green">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-section text-foreground">Review complete</h2>
        <p className="text-foreground">
          You answered {right} of {items.length} correctly.
        </p>
        <ol aria-hidden="true" className="flex flex-wrap justify-center gap-1">
          {outcomes.map((correct, n) => (
            <li
              key={n}
              className={cn(
                "grid size-9 place-items-center rounded-sm border",
                correct ? "border-green bg-soft-green text-green" : "border-destructive bg-soft-red text-destructive",
              )}
            >
              {correct ? <Check className="size-4" strokeWidth={2.5} /> : <X className="size-4" strokeWidth={2.5} />}
            </li>
          ))}
        </ol>
        <ul className="flex flex-col items-center gap-2">
          <li className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="green">
              <Check aria-hidden="true" />
              {right} correct
            </Badge>
            <span className="text-sm text-muted-foreground">Removed from your mistakes.</span>
          </li>
          <li className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="red">
              <X aria-hidden="true" />
              {wrong} incorrect
            </Badge>
            <span className="text-sm text-muted-foreground">Still in your mistakes, so you can review them again whenever you like.</span>
          </li>
        </ul>
        {remaining > 0 && (
          <p className="text-sm text-muted-foreground">
            {pluralise(remaining, "more mistake")} in {scopeName} {remaining === 1 ? "is" : "are"} still open.
          </p>
        )}
        <p className="flex items-start gap-2 text-left text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Reviewing mistakes doesn&apos;t change your mastery. Only your quiz answers count.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {remaining > 0 && (
            <Button type="button" onClick={onMore}>
              <RotateCcw aria-hidden="true" />
              Review more
            </Button>
          )}
          <Button variant={remaining > 0 ? "outline" : "default"} nativeButton={false} render={<Link href={exitHref} />}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  const answered = index + (result ? 1 : 0);
  const isLast = index + 1 === items.length;

  return (
    <Card className="gap-6 p-6 max-sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section text-foreground">
            Question {index + 1} of {items.length}
          </h2>
          <Button variant="outline" nativeButton={false} render={<Link href={exitHref} />} onClick={handleExit}>
            Exit
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground" aria-hidden="true">
            {answered} of {items.length} checked
          </p>
          <LabelledProgressBar value={answered} max={items.length} label={`${answered} of ${items.length} checked`} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <Badge tone="purple">{current.topicName}</Badge>
          <p id="review-question" className="text-card-title break-words text-foreground">
            {current.prompt}
          </p>
        </div>
        <RadioGroup
          key={current.id}
          value={selected}
          disabled={result !== null}
          aria-labelledby="review-question"
          onValueChange={(value) => setSelected(Number(value))}
          onKeyDown={(event) => {
            // Enter checks the picked answer, as in the quiz screen. Only from the options, so it never doubles a button's own click.
            if (event.key !== "Enter") return;
            event.preventDefault();
            void check();
          }}
        >
          {current.options.map((option, optionIndex) => {
            const picked = selected === optionIndex;
            const isCorrect = result !== null && optionIndex === result.correctIndex;
            const isWrongPick = result !== null && picked && !isCorrect;
            return (
              <label
                key={optionIndex}
                className={cn(
                  "flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-4 text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  result === null && "cursor-pointer",
                  result === null && (picked ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]" : "border-input bg-card hover:bg-surface-hover"),
                  isCorrect && "border-green bg-soft-green shadow-[inset_0_0_0_1px_var(--green)]",
                  isWrongPick && "border-destructive bg-soft-red shadow-[inset_0_0_0_1px_var(--destructive)]",
                  result !== null && !isCorrect && !isWrongPick && "border-input bg-card",
                )}
              >
                {/* The real radio stays focusable for the keyboard; its ring shows on the whole row (`has-focus-visible`). */}
                <span className="sr-only">
                  <RadioGroupItem value={optionIndex} />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
                    result === null && picked && "border-primary bg-primary text-primary-foreground",
                    isCorrect && "border-green bg-green text-primary-foreground",
                    isWrongPick && "border-destructive bg-destructive text-destructive-foreground",
                    !(result === null && picked) && !isCorrect && !isWrongPick && "border-input",
                  )}
                >
                  {OPTION_LETTERS[optionIndex]}
                </span>
                <span className="min-w-[12rem] flex-1 break-words">{option}</span>
                {result === null && picked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                {isCorrect && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-green">
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Correct answer
                  </span>
                )}
                {isWrongPick && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-destructive">
                    <CircleX className="size-4" aria-hidden="true" />
                    Your answer
                  </span>
                )}
              </label>
            );
          })}
        </RadioGroup>
      </div>

      <div aria-live="polite">
        {result && (
          <Alert variant={result.outcome === "correct" ? "success" : "warning"} role={undefined}>
            {result.outcome === "correct" ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
            <AlertTitle>
              {result.outcome === "correct"
                ? "Correct. This one is removed from your mistakes."
                : `Not quite. The correct answer is ${OPTION_LETTERS[result.correctIndex]}. It stays in your mistakes.`}
            </AlertTitle>
            {result.explanation && <p className="col-start-2 text-foreground">{result.explanation}</p>}
          </Alert>
        )}
      </div>
      {checkError && (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t check that answer</AlertTitle>
          <p className="text-destructive">{checkError} Your answer is still picked; press Check again.</p>
        </Alert>
      )}

      <div className="flex justify-end">
        {result === null ? (
          <Button type="button" className="max-sm:w-full" disabled={selected === null || checking} onClick={() => void check()}>
            {checking && <Loader2 className="animate-spin" aria-hidden="true" />}
            Check
          </Button>
        ) : (
          <Button ref={nextRef} type="button" className="max-sm:w-full" onClick={next}>
            {isLast ? "Finish" : "Next"}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without checking this answer?</AlertDialogTitle>
            <AlertDialogDescription>Answers you already checked are kept. This one hasn&apos;t been checked yet, so it won&apos;t count.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push(exitHref)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
