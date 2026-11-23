"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { FlashcardsClientError, type FlashcardsClient } from "../client/flashcards-client";
import type { DeckSessionResponse, Rating } from "../flashcards-schemas";
import { PracticeCardView } from "./practice-card";

type Summary = { gotIt: number; again: number };

/** Space flips the card, unless the student is typing or pressing a control that Space already activates. */
const SPACE_IGNORED = "textarea, input, select, button, a, summary, [role='dialog'], [role='alertdialog'], [contenteditable='true']";

/**
 * The flashcard practice screen (Figma nodes 61:25668 front, 61:25852 revealed,
 * 61:26051 rating selected, 61:26257 next card, 72:6957 exit with an unsaved
 * rating, 71:6632 paused practice, 61:26447 completion). One route covers a
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
        setLoadError(err instanceof FlashcardsClientError ? err.message : "Couldn't load this deck. Try again.");
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
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {loadError}
          </p>
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={libraryHref} />}>
            Back to flashcards
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[20px]" />
      </div>
    );
  }

  if (summary) {
    return (
      <Card className="max-w-2xl rounded-[20px] p-8">
        <CardContent className="flex flex-col gap-5 p-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground">Practice complete</h2>
            <p className="text-sm text-muted-foreground">{session.title}</p>
          </div>
          <p className="text-2xl font-semibold text-foreground">
            Got it {summary.gotIt} · Again {summary.again}
          </p>
          <p className="text-sm text-muted-foreground">
            Ratings are just for you: they don&apos;t change your mastery or schedule anything.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="h-11 rounded-full px-6" onClick={handlePractiseAgain}>
              Practise again
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-full px-6" nativeButton={false} render={<Link href={libraryHref} />}>
              Back to flashcards
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            This deck has no cards to practise.
          </p>
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={libraryHref} />}>
            Back to flashcards
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl font-semibold text-foreground">
            Card {index + 1} of {cards.length}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {session.title}
            {resumed ? " · Continuing where you left off" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-full px-6"
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
      </div>

      <Progress value={(index / cards.length) * 100} aria-label={`${index} of ${cards.length} cards done`} />

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
        <div className="flex flex-col gap-2">
          {saveError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              className="h-11 rounded-full px-8 text-base"
              disabled={selected === null || saving}
              aria-disabled={selected === null || saving}
              onClick={() => void handleNext()}
            >
              {saving ? "Saving…" : "Next"}
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
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push(libraryHref)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
