"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Info, Layers, RotateCcw } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { FlashcardsClientError, type FlashcardsClient } from "../client/flashcards-client";
import type { DeckSessionResponse, Rating } from "../flashcards-schemas";
import { PracticeCardView } from "./practice-card";

type Summary = { gotIt: number; again: number };

/** Space flips the card, unless the student is typing or pressing a control that Space already activates. */
const SPACE_IGNORED = "textarea, input, select, button, a, summary, [role='dialog'], [role='alertdialog'], [contenteditable='true']";

/**
 * The flashcard practice screen (T-18; UI redesign 2026-11-23, following the
 * quiz attempt screen: the deck's name and Exit, progress, the card, Next). One route covers a
 * first practice, Resume and Practise again: `client.startOrResumePractice`
 * decides which.
 *
 * Flow per card: front → flip (button or Space) → choose Again or Got it → Next.
 * Choosing only selects; Next saves it, so leaving mid-deck keeps every card
 * rated so far ("Paused practice"). Leaving with a chosen but unsaved rating
 * asks first. Ratings never touch mastery and schedule nothing; no date appears
 * anywhere. What a student types into a short-answer card stays in this
 * component's state and is never sent.
 */
export function PracticeView({ spaceId, setId, client }: { spaceId: string; setId: string; client: FlashcardsClient }) {
  const router = useRouter();
  const [session, setSession] = useState<DeckSessionResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [selected, setSelected] = useState<Rating | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Blocks a second save while one is in flight (a double click on Next).
  const savingRef = useRef(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const libraryHref = `/spaces/${spaceId}/flashcards`;

  useEffect(() => {
    let ignore = false;
    client
      .startOrResumePractice(setId)
      .then((response) => {
        if (ignore) return;
        setSession(response);
        // Opens on the first card not rated yet; a fresh session starts at card 1.
        const firstUnrated = response.cards.findIndex((card) => response.ratings[card.id] === undefined);
        setIndex(firstUnrated >= 0 ? firstUnrated : 0);
        setResumed(Object.keys(response.ratings).length > 0);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setLoadError(err instanceof FlashcardsClientError ? err.message : "Couldn't load this deck.");
      });
    return () => {
      ignore = true;
    };
  }, [client, setId, loadKey]);

  // Next 16 (Cache Components) hides this page instead of unmounting it when
  // the student navigates away and shows the same instance on return. The
  // cleanup runs when it is hidden and resets everything that belongs to that
  // visit; on return the effect above loads the session again (Resume).
  useLayoutEffect(() => {
    return () => {
      setSession(null);
      setLoadError(null);
      setResumed(false);
      setIndex(0);
      setRevealed(false);
      setTyped("");
      setSelected(null);
      setSaving(false);
      setSaveError(null);
      setSummary(null);
      setLeaveOpen(false);
      savingRef.current = false;
    };
  }, []);

  const cards = session?.cards ?? [];
  const card = cards[index];
  const practising = session !== null && summary === null && card !== undefined;

  // Focus follows the card: the new front when a card appears, the answer after flipping.
  useEffect(() => {
    if (practising) frontRef.current?.focus({ preventScroll: true });
  }, [practising, index]);
  useEffect(() => {
    if (revealed) answerRef.current?.focus({ preventScroll: true });
  }, [revealed]);

  // Space flips the card (PRD Section 2, Accessibility).
  useEffect(() => {
    if (!practising || revealed || leaveOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || event.repeat) return;
      if ((event.target as HTMLElement | null)?.closest(SPACE_IGNORED)) return;
      event.preventDefault();
      setRevealed(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [practising, revealed, leaveOpen]);

  function resetCardState() {
    setRevealed(false);
    setTyped("");
    setSelected(null);
    setSaveError(null);
  }

  async function handleNext() {
    if (!session || !card || selected === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await client.rateCard(card.id, { sessionId: session.id, rating: selected });
      if (result.status === "completed" || index + 1 >= cards.length) {
        setSummary({ gotIt: result.gotIt, again: result.again });
        return;
      }
      resetCardState();
      setIndex(index + 1);
    } catch (err) {
      // The selection stays, so Next can simply be pressed again.
      setSaveError(err instanceof FlashcardsClientError ? err.message : "Couldn't save your rating. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handlePractiseAgain() {
    setSession(null);
    setSummary(null);
    setLoadError(null);
    resetCardState();
    setIndex(0);
    setLoadKey((key) => key + 1);
  }

  if (loadError) {
    return (
      <Card role="alert" className="mt-6 gap-4 p-6 max-sm:p-4">
        <h2 className="text-card-title text-foreground">We couldn&apos;t load this deck</h2>
        <p className="text-muted-foreground">{loadError} Check your connection and try again.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoadError(null);
              setLoadKey((key) => key + 1);
            }}
          >
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
          <Button variant="ghost" nativeButton={false} render={<Link href={libraryHref} />}>
            Back to flashcards
          </Button>
        </div>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy="true">
        <p className="sr-only" role="status">
          Loading this deck.
        </p>
        <Skeleton className="h-8 w-64 max-w-full" aria-hidden="true" />
        <Card className="gap-4 p-6" aria-hidden="true">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-11 w-40" />
        </Card>
      </div>
    );
  }

  if (summary) {
    return (
      <Card className="mx-auto mt-6 w-full max-w-[48rem] items-center gap-4 px-6 py-10 text-center max-sm:px-4">
        <span className="flex size-12 items-center justify-center rounded-lg bg-soft-green text-green">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-section text-foreground">Practice complete</h2>
        <p className="text-muted-foreground">{session.title}</p>
        <ul className="flex flex-wrap justify-center gap-2">
          <li>
            <Badge tone="green">
              <Check aria-hidden="true" />
              Got it {summary.gotIt}
            </Badge>
          </li>
          <li>
            <Badge tone="amber">
              <RotateCcw aria-hidden="true" />
              Again {summary.again}
            </Badge>
          </li>
        </ul>
        <p className="flex items-start gap-2 text-left text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Ratings are just for you: they don&apos;t change your mastery or schedule anything.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={handlePractiseAgain}>
            <RotateCcw aria-hidden="true" />
            Practise again
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={libraryHref} />}>
            Back to flashcards
          </Button>
        </div>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card className="mt-6 items-center gap-4 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-soft-purple text-purple">
          <Layers className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-card-title text-foreground">No cards to practise</h2>
        <p className="max-w-[42rem] text-muted-foreground">This deck&apos;s material was deleted, so it has no cards left to practise.</p>
        <Button variant="outline" nativeButton={false} render={<Link href={libraryHref} />}>
          Back to flashcards
        </Button>
      </Card>
    );
  }

  return (
    <section aria-labelledby="practice-title" className="mt-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="practice-title" className="text-section break-words text-foreground">
            {session.title}
          </h2>
          <p className="mt-1 text-muted-foreground">
            Card {index + 1} of {cards.length}
            {resumed ? " · Continuing where you left off" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={libraryHref} />}
          onClick={(event) => {
            // A chosen rating is only saved by Next: ask before throwing it away.
            if (selected !== null && !saving) {
              event.preventDefault();
              setLeaveOpen(true);
            }
          }}
        >
          Exit
        </Button>
      </header>

      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground" aria-hidden="true">
          {index} of {cards.length} rated
        </p>
        <LabelledProgressBar value={index} max={cards.length} label={`${index} of ${cards.length} cards rated`} />
      </div>

      <PracticeCardView
        key={card.id}
        card={card}
        revealed={revealed}
        typed={typed}
        onTypedChange={setTyped}
        onFlip={() => setRevealed(true)}
        selected={selected}
        onSelect={setSelected}
        frontRef={frontRef}
        answerRef={answerRef}
      />

      {revealed && (
        <div className="flex flex-col gap-3">
          {saveError && (
            <Alert variant="destructive">
              <AlertTitle>We couldn&apos;t save your rating</AlertTitle>
              <AlertDescription>{saveError} Your choice is kept; press Next again.</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Your rating is just for you. It doesn&apos;t change your mastery.</p>
            <Button
              type="button"
              className="max-sm:w-full"
              disabled={selected === null || saving}
              aria-disabled={selected === null || saving}
              onClick={() => void handleNext()}
            >
              {saving ? "Saving…" : index + 1 >= cards.length ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving this rating?</AlertDialogTitle>
            <AlertDialogDescription>
              Your rating for this card is saved when you press Next. Cards you already rated are saved, and you can resume later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep practising</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push(libraryHref)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
