"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Info, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SetTopicTags } from "@/features/quizzes/components/set-topic-tags";
import type { DeckListItemResponse } from "../flashcards-schemas";
import { CARD_STYLE_LABELS, cardCountLabel } from "../flashcards-format";
import { DecksEmptyState } from "./decks-empty-state";
import { DecksStatusFilter, matchesDeckFilter, type DecksFilterValue } from "./decks-status-filter";

const SESSION_LABELS = { none: "Not started", in_progress: "Paused practice", completed: "Completed" } as const;
const SESSION_TONES = { none: "neutral", in_progress: "amber", completed: "green" } as const;

function DeckStatusPill({ deck }: { deck: DeckListItemResponse }) {
  if (deck.status === "generating") return <Badge tone="amber">Generating</Badge>;
  if (deck.status === "failed") return <Badge tone="red">Generation failed</Badge>;
  // A ready deck whose cards all lost their material can only be deleted.
  if (deck.practisableCount === 0) return <Badge tone="neutral">Material deleted</Badge>;
  return <Badge tone={SESSION_TONES[deck.latestSession.status]}>{SESSION_LABELS[deck.latestSession.status]}</Badge>;
}

/** The line under the title: what the deck holds, or why it isn't ready. */
function deckMeta(deck: DeckListItemResponse): string {
  if (deck.status === "generating") return "Preparing your cards. You can keep studying.";
  if (deck.status === "failed") return deck.error?.message ?? "We couldn't generate these flashcards. Try again.";
  if (deck.practisableCount === 0) return "This deck's material was deleted, so it has no cards to practise. You can delete it.";
  const parts = [cardCountLabel(deck.generatedCount)];
  if (deck.cardStyle) parts.push(CARD_STYLE_LABELS[deck.cardStyle]);
  if (deck.generatedCount < deck.requestedCount) parts.push(`${deck.generatedCount} of ${deck.requestedCount} generated`);
  return parts.join(" · ");
}

/** The primary action plus the "⋯" menu (Rename deck; Delete deck, always allowed: ratings aren't mastery evidence). */
function DeckCardActions({
  spaceId,
  deck,
  onDelete,
  onRename,
}: {
  spaceId: string;
  deck: DeckListItemResponse;
  onDelete: (deck: DeckListItemResponse) => void;
  onRename: (deck: DeckListItemResponse) => void;
}) {
  const practiceHref = `/spaces/${spaceId}/flashcards/${deck.id}`;
  const session = deck.latestSession;

  let primary: ReactNode = null;
  if (deck.status === "failed") {
    primary = (
      <Button variant="outline" nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards/new?retry=${deck.id}`} />}>
        Try again
      </Button>
    );
  } else if (deck.status === "ready" && deck.practisableCount > 0) {
    const label = session.status === "none" ? "Practise" : session.status === "in_progress" ? "Resume practice" : "Practise again";
    primary = (
      <Button nativeButton={false} render={<Link href={practiceHref} />}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">{primary}</div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${deck.title}`} />}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onRename(deck)}>
            <Pencil aria-hidden="true" />
            Rename deck
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(deck)}>
            <Trash2 aria-hidden="true" />
            Delete deck
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** One deck (same hierarchy as a quiz card): icon and status, name, what it holds, topics, progress or last result, actions. */
function DeckCard({
  spaceId,
  deck,
  onDelete,
  onRename,
}: {
  spaceId: string;
  deck: DeckListItemResponse;
  onDelete: (deck: DeckListItemResponse) => void;
  onRename: (deck: DeckListItemResponse) => void;
}) {
  const session = deck.latestSession;
  const practisable = deck.status === "ready" && deck.practisableCount > 0;
  const titleId = `deck-${deck.id}-title`;
  return (
    <Card className="gap-4 p-6 max-sm:p-4" aria-labelledby={titleId} role="article">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-soft-purple text-purple">
          <Layers className="size-5" aria-hidden="true" />
        </span>
        <DeckStatusPill deck={deck} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-card-title break-words text-foreground">
          {deck.title}
        </h3>
        <p className="text-sm text-muted-foreground">{deckMeta(deck)}</p>
      </div>
      <SetTopicTags setId={deck.id} topics={deck.topics} label="Topics in this deck" />

      {practisable && session.status === "in_progress" && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground" aria-hidden="true">
            {session.ratedCount} of {session.totalCount} rated
          </p>
          <LabelledProgressBar value={session.ratedCount} max={session.totalCount} label={`${session.ratedCount} of ${session.totalCount} rated`} />
        </div>
      )}
      {practisable && session.status === "completed" && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-muted-foreground">Last practice</span>
          <span className="font-semibold text-foreground">Got it {session.gotIt}</span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="font-semibold text-foreground">Again {session.again}</span>
        </p>
      )}

      <div className="mt-auto">
        <DeckCardActions spaceId={spaceId} deck={deck} onDelete={onDelete} onRename={onRename} />
      </div>
    </Card>
  );
}

function DeckLibrarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your flashcards.
      </p>
      {[0, 1].map((key) => (
        <Card key={key} className="gap-4 p-6" aria-hidden="true">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-11 w-32" />
        </Card>
      ))}
    </div>
  );
}

/**
 * The Deck Library (T-18; UI redesign 2026-11-23, following the approved
 * Quizzes design): a status filter and a grid of deck cards. No dates and no
 * schedule anywhere: ratings are only the student's own record.
 */
export function DeckLibrary({
  spaceId,
  decks,
  loading,
  actionError,
  onDelete,
  onRename,
}: {
  spaceId: string;
  decks: DeckListItemResponse[];
  loading: boolean;
  actionError?: string | null;
  onDelete: (deck: DeckListItemResponse) => void;
  onRename: (deck: DeckListItemResponse) => void;
}) {
  const [filter, setFilter] = useState<DecksFilterValue>("all");
  const visible = decks.filter((deck) => matchesDeckFilter(deck, filter));

  return (
    <section aria-labelledby="decks-heading" className="mt-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="decks-heading" className="flex items-center gap-2 text-section text-foreground">
            Flashcards {!loading && <CountChip count={decks.length} />}
          </h2>
          <p className="mt-1 max-w-[42rem] text-muted-foreground">Practise recall and short-answer cards made from your confirmed topics.</p>
        </div>
        {!loading && decks.length > 0 && (
          <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards/new`} />}>
            <Plus aria-hidden="true" />
            Create flashcards
          </Button>
        )}
      </header>

      {actionError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {actionError}
        </p>
      )}

      {loading ? (
        <DeckLibrarySkeleton />
      ) : decks.length === 0 ? (
        <DecksEmptyState spaceId={spaceId} />
      ) : (
        <>
          <DecksStatusFilter decks={decks} value={filter} onChange={setFilter} />
          {visible.length === 0 ? (
            <Card className="px-6 py-8 text-center">
              <p className="text-muted-foreground">No decks with this status.</p>
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {visible.map((deck) => (
                <li key={deck.id} className="flex [&>*]:flex-1">
                  <DeckCard spaceId={spaceId} deck={deck} onDelete={onDelete} onRename={onRename} />
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Ratings are just for you. They don&apos;t change your mastery or schedule anything.
          </p>
        </>
      )}
    </section>
  );
}
