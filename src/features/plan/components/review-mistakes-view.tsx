"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
 * Review mistakes (T-15; Figma 65:45242, 65:45416, 72:6987, 65:45993, adapted
 * to the MCQ "Check" flow): re-answer questions the student got wrong, whenever
 * they choose. Loads the list on mount (and again after "Review more"), so it is
 * always current even when this route was kept mounted by Cache Components.
 * `exitHref` is where Exit and "Back" go; `scopeName` names the topic or space.
 */
export function ReviewMistakesView({
  client,
  scope,
  scopeName,
  exitHref,
}: {
  client: PlanClient;
  scope: MistakesScope;
  scopeName: string;
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

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[20px]" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <StatusCard icon={<AlertTriangle className="size-6" aria-hidden="true" />} tone="error" title="Couldn't load your mistakes" message={state.message}>
        <Button type="button" className="rounded-full" onClick={reload}>
          Try again
        </Button>
      </StatusCard>
    );
  }

  if (state.data.items.length === 0) {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-6" aria-hidden="true" />}
        tone="ok"
        title="No mistakes to review"
        message={`You have no open mistakes in ${scopeName}. Questions you get wrong in a quiz appear here.`}
      >
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={exitHref} />}>
          Back
        </Button>
      </StatusCard>
    );
  }

  return (
    <ReviewSession
      key={state.loadId}
      client={client}
      items={state.data.items}
      total={state.data.total}
      scopeName={scopeName}
      exitHref={exitHref}
      onMore={reload}
    />
  );
}

function StatusCard({
  icon,
  tone,
  title,
  message,
  children,
}: {
  icon: React.ReactNode;
  tone: "ok" | "error";
  title: string;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
        <span className={cn("flex size-12 items-center justify-center rounded-full", tone === "ok" ? "bg-soft-green text-green" : "bg-destructive/10 text-destructive")}>{icon}</span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p role={tone === "error" ? "alert" : undefined} className="max-w-sm text-sm text-muted-foreground">
            {message}
          </p>
        </div>
        {children}
      </CardContent>
    </Card>
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
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-5 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-soft-green text-green">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Review complete</h2>
            <p className="text-sm text-foreground">
              You answered {right} of {items.length} correctly.
            </p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>{right} correct: removed from your mistakes.</li>
              <li>{wrong} incorrect: still in your mistakes, so you can review them again whenever you like.</li>
              {remaining > 0 && (
                <li>
                  {pluralise(remaining, "more mistake")} in {scopeName} {remaining === 1 ? "is" : "are"} still open.
                </li>
              )}
            </ul>
            <p className="text-sm text-muted-foreground">Reviewing mistakes doesn&apos;t change your mastery. Only your quiz answers count.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {remaining > 0 && (
              <Button type="button" className="rounded-full" onClick={onMore}>
                Review more
              </Button>
            )}
            <Button type="button" variant={remaining > 0 ? "outline" : "default"} className="rounded-full" nativeButton={false} render={<Link href={exitHref} />}>
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const answered = index + (result ? 1 : 0);
  const isLast = index + 1 === items.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            Question {index + 1} of {items.length}
          </h2>
          <Button variant="outline" className="rounded-full" nativeButton={false} render={<Link href={exitHref} />} onClick={handleExit}>
            Exit
          </Button>
        </div>
        <Progress value={(answered / items.length) * 100} aria-label={`${answered} of ${items.length} checked`} />
      </div>

      <Card className="rounded-[20px] p-6">
        <CardContent className="flex flex-col gap-4 p-0">
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-purple px-2.5 text-xs font-semibold text-purple">{current.topicName}</span>
          <p className="text-lg font-medium text-foreground">{current.prompt}</p>
          <RadioGroup
            key={current.id}
            value={selected}
            disabled={result !== null}
            aria-label="Answer options"
            onValueChange={(value) => setSelected(Number(value))}
            onKeyDown={(event) => {
              // Enter checks the picked answer, as in the quiz screen. Only from the options, so it never doubles a button's own click.
              if (event.key !== "Enter") return;
              event.preventDefault();
              void check();
            }}
          >
            {current.options.map((option, optionIndex) => {
              const isCorrect = result !== null && optionIndex === result.correctIndex;
              const isWrongPick = result !== null && optionIndex === selected && !isCorrect;
              return (
                <label
                  key={optionIndex}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-foreground",
                    result === null && "cursor-pointer",
                    result === null && (selected === optionIndex ? "border-primary bg-soft-purple/30" : "border-border hover:bg-muted"),
                    isCorrect && "border-green bg-soft-green",
                    isWrongPick && "border-amber bg-soft-amber",
                    result !== null && !isCorrect && !isWrongPick && "border-border",
                  )}
                >
                  <RadioGroupItem value={optionIndex} />
                  <span className="w-4 shrink-0 font-semibold text-muted-foreground">{OPTION_LETTERS[optionIndex]}</span>
                  <span className="min-w-0 flex-1">{option}</span>
                  {isCorrect && <span className="shrink-0 text-xs font-semibold text-green">Correct answer</span>}
                  {isWrongPick && <span className="shrink-0 text-xs font-semibold text-amber">Your answer</span>}
                </label>
              );
            })}
          </RadioGroup>

          <div aria-live="polite">
            {result && (
              <div className={cn("flex flex-col gap-2 rounded-xl p-4 text-sm", result.outcome === "correct" ? "bg-soft-green" : "bg-soft-amber")}>
                <p className={cn("flex items-center gap-2 font-semibold", result.outcome === "correct" ? "text-green" : "text-amber")}>
                  {result.outcome === "correct" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                  {result.outcome === "correct" ? "Correct. This one is removed from your mistakes." : `Not quite. The correct answer is ${OPTION_LETTERS[result.correctIndex]}. It stays in your mistakes.`}
                </p>
                {result.explanation && <p className="text-foreground">{result.explanation}</p>}
              </div>
            )}
          </div>
          {checkError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {checkError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {result === null ? (
          <Button type="button" className="gap-2 rounded-full" disabled={selected === null || checking} onClick={() => void check()}>
            {checking && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Check
          </Button>
        ) : (
          <Button ref={nextRef} type="button" className="rounded-full" onClick={next}>
            {isLast ? "Finish" : "Next"}
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
    </div>
  );
}
