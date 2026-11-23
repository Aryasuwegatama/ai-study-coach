"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DeckListItemResponse } from "../flashcards-schemas";
import { CARD_STYLE_LABELS } from "../flashcards-format";
import { DecksEmptyState } from "./decks-empty-state";

const SESSION_LABELS = { none: "Not started", in_progress: "Paused practice", completed: "Completed" } as const;
const SESSION_CLASSES = {
  none: "bg-muted text-muted-foreground",
  in_progress: "bg-soft-amber text-amber",
  completed: "bg-soft-green text-green",
} as const;

const PILL = "inline-flex h-7 w-fit shrink-0 items-center rounded-full px-3 text-xs font-semibold";

function DeckStatusPill({ deck }: { deck: DeckListItemResponse }) {
  if (deck.status === "generating") return <span className={`${PILL} bg-soft-amber text-amber`}>Generating</span>;
  if (deck.status === "failed") return <span className={`${PILL} bg-destructive/10 text-destructive`}>Generation failed</span>;
  // A ready deck whose cards all lost their material can only be deleted.
  if (deck.practisableCount === 0) return <span className={`${PILL} bg-muted text-muted-foreground`}>Material deleted</span>;
  return <span className={`${PILL} ${SESSION_CLASSES[deck.latestSession.status]}`}>{SESSION_LABELS[deck.latestSession.status]}</span>;
}

/** The primary action plus the "⋯" menu. Delete is always available for a deck (ratings aren't mastery evidence). */
function DeckCardActions({
  spaceId,
  deck,
  onDelete,
}: {
  spaceId: string;
  deck: DeckListItemResponse;
  onDelete: (deck: DeckListItemResponse) => void;
}) {
  const practiceHref = `/spaces/${spaceId}/flashcards/${deck.id}`;
  const session = deck.latestSession;

  let primary: ReactNode = null;
  if (deck.status === "failed") {
    primary = (
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        nativeButton={false}
        render={<Link href={`/spaces/${spaceId}/flashcards/new?retry=${deck.id}`} />}
      >
        Try again
      </Button>
    );
  } else if (deck.status === "ready" && deck.practisableCount > 0) {
    const label = session.status === "none" ? "Practise" : session.status === "in_progress" ? "Resume" : "Practise again";
    primary = (
      <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={practiceHref} />}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${deck.title}`} />}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(deck)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DeckCard({
  spaceId,
  deck,
  onDelete,
}: {
  spaceId: string;
  deck: DeckListItemResponse;
  onDelete: (deck: DeckListItemResponse) => void;
}) {
  const session = deck.latestSession;
  return (
    <Card className="flex flex-col rounded-[20px] p-5">
      <CardContent className="flex flex-1 flex-col gap-3 p-0">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground">{deck.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <DeckStatusPill deck={deck} />
          {deck.cardStyle && <span className={`${PILL} bg-soft-purple text-purple`}>{CARD_STYLE_LABELS[deck.cardStyle]}</span>}
        </div>

        {deck.status === "ready" && deck.generatedCount < deck.requestedCount && (
          <p className="text-xs text-muted-foreground">
            {deck.generatedCount} of {deck.requestedCount} generated
          </p>
        )}
        {deck.status === "ready" && deck.generatedCount >= deck.requestedCount && (
          <p className="text-xs text-muted-foreground">
            {deck.generatedCount} card{deck.generatedCount === 1 ? "" : "s"}
          </p>
        )}
        {deck.status === "failed" && deck.error && <p className="text-xs text-muted-foreground">{deck.error.message}</p>}
        {deck.status === "ready" && deck.practisableCount === 0 && (
          <p className="text-xs text-muted-foreground">This deck&apos;s material was deleted</p>
        )}
        {deck.status === "ready" && deck.practisableCount > 0 && session.status === "in_progress" && (
          <p className="text-xs text-muted-foreground">
            {session.ratedCount} of {session.totalCount} rated
          </p>
        )}
        {deck.status === "ready" && deck.practisableCount > 0 && session.status === "completed" && (
          <p className="text-xs text-muted-foreground">
            Got it {session.gotIt} · Again {session.again}
          </p>
        )}

        <div className="mt-auto pt-2">
          <DeckCardActions spaceId={spaceId} deck={deck} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

function DeckLibrarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-44 w-full rounded-[20px]" />
      ))}
    </div>
  );
}

/**
 * The Deck Library (Figma nodes 61:24863 populated, 61:24675 empty, 61:25258
 * generating, 61:25470 failed, 71:6632 paused practice). A grid of cards like
 * the Quiz Library. No dates and no schedule anywhere: ratings are only the
 * student's own record.
 */
export function DeckLibrary({
  spaceId,
  decks,
  loading,
  actionError,
  onDelete,
}: {
  spaceId: string;
  decks: DeckListItemResponse[];
  loading: boolean;
  actionError?: string | null;
  onDelete: (deck: DeckListItemResponse) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Flashcards · {decks.length}</h2>
        {!loading && decks.length > 0 && (
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards/new`} />}>
            Generate flashcards
          </Button>
        )}
      </div>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <DeckCard key={deck.id} spaceId={spaceId} deck={deck} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
