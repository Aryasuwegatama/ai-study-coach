"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TopicResponse } from "../topics-schemas";
import { TopicsClientError, topicsClient } from "../client/api-topics-client";
import { ArchiveTopicDialog } from "./archive-topic-dialog";
import { RenameTopicDialog } from "./rename-topic-dialog";

function sortByName(list: TopicResponse[]): TopicResponse[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function TopicRow({
  topic,
  pillLabel,
  pillClassName,
  onRename,
  onArchive,
}: {
  topic: TopicResponse;
  pillLabel: string;
  pillClassName: string;
  onRename: (topic: TopicResponse) => void;
  onArchive: (topic: TopicResponse) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{topic.name}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${pillClassName}`}>
          {pillLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${topic.name}`} />}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRename(topic)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(topic)}>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/**
 * The populated Overview's "Confirmed topics · N" card (T-09c; Figma
 * node 47:17982/47:18168), plus (Arya, 2026-11-19) a second group for
 * confirmed topics with no linked material. A topic with no quiz or
 * flashcard history is deleted along with its last material; one that
 * does have history lands here instead (never auto-archived), and
 * relinks automatically when a material with the same name is next
 * confirmed.
 * `initialLinkedTopics`/`initialUnlinkedTopics` are the server's
 * confirmed-only lists (`?materials=linked`/`unlinked`); archived topics
 * are fetched client-side once (for "Show archived (N)") so the Overview
 * page itself only ever loads confirmed topics, as the plan's Approach
 * step 7 describes.
 */
export function ConfirmedTopicsCard({
  spaceId,
  initialLinkedTopics,
  initialUnlinkedTopics,
  hasMaterialAwaitingReview,
}: {
  spaceId: string;
  initialLinkedTopics: TopicResponse[];
  initialUnlinkedTopics: TopicResponse[];
  hasMaterialAwaitingReview: boolean;
}) {
  const [linkedTopics, setLinkedTopics] = useState<TopicResponse[]>(() => sortByName(initialLinkedTopics));
  const [unlinkedTopics, setUnlinkedTopics] = useState<TopicResponse[]>(() => sortByName(initialUnlinkedTopics));
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [archived, setArchived] = useState<TopicResponse[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<TopicResponse | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TopicResponse | null>(null);

  useEffect(() => {
    let ignore = false;
    topicsClient
      .list(spaceId, { includeArchived: true })
      .then((all) => {
        if (ignore) return;
        setArchived(sortByName(all.filter((topic) => topic.status === "archived")));
      })
      .catch(() => {
        // Archived count/restore is a nice-to-have; the confirmed lists
        // above already work from the server-rendered props.
      });
    return () => {
      ignore = true;
    };
  }, [spaceId]);

  function handleRenamed(topic: TopicResponse) {
    setLinkedTopics((prev) => (prev.some((t) => t.id === topic.id) ? sortByName(prev.map((t) => (t.id === topic.id ? topic : t))) : prev));
    setUnlinkedTopics((prev) => (prev.some((t) => t.id === topic.id) ? sortByName(prev.map((t) => (t.id === topic.id ? topic : t))) : prev));
  }

  function handleArchived(topic: TopicResponse) {
    setLinkedTopics((prev) => prev.filter((t) => t.id !== topic.id));
    setUnlinkedTopics((prev) => prev.filter((t) => t.id !== topic.id));
    setArchived((prev) => sortByName([...(prev ?? []), topic]));
  }

  async function handleRestore(topic: TopicResponse) {
    setRestoringId(topic.id);
    setRestoreError(null);
    try {
      await topicsClient.update(topic.id, { status: "confirmed" });
      setArchived((prev) => (prev ?? []).filter((t) => t.id !== topic.id));
      // Whether it comes back linked or unlinked depends on whether any
      // `material_topics` row still points at it, which this component
      // doesn't track locally — re-fetch both lists rather than guess.
      const [linked, unlinked] = await Promise.all([
        topicsClient.list(spaceId, { materials: "linked" }),
        topicsClient.list(spaceId, { materials: "unlinked" }),
      ]);
      setLinkedTopics(sortByName(linked));
      setUnlinkedTopics(sortByName(unlinked));
    } catch (error) {
      setRestoreError(error instanceof TopicsClientError ? error.message : "Something went wrong. Please try again.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <CardContent className="flex flex-col gap-4 p-0">
        <h2 className="text-lg font-semibold text-foreground">Confirmed topics · {linkedTopics.length}</h2>

        {linkedTopics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No confirmed topics yet.{" "}
            {hasMaterialAwaitingReview ? (
              <>
                <Link
                  href={`/spaces/${spaceId}/materials`}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Review a material&apos;s topics
                </Link>{" "}
                to add them here.
              </>
            ) : (
              "Review a material's topics to add them here."
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linkedTopics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                pillLabel="Confirmed"
                pillClassName="bg-soft-green text-green"
                onRename={setRenameTarget}
                onArchive={setArchiveTarget}
              />
            ))}
          </ul>
        )}

        {unlinkedTopics.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowUnlinked((value) => !value)}
              className="w-fit cursor-pointer text-sm font-medium text-primary underline underline-offset-2"
            >
              {showUnlinked ? "Hide topics from deleted materials" : `Topics from deleted materials (${unlinkedTopics.length})`}
            </button>
            {showUnlinked && (
              <>
                <p className="text-xs text-muted-foreground">
                  You made quizzes or flashcards from these topics, so their results stay in your progress. Upload a
                  material that covers them to use them again.
                </p>
                <ul className="flex flex-col gap-2">
                  {unlinkedTopics.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      pillLabel="No material"
                      pillClassName="bg-muted text-muted-foreground"
                      onRename={setRenameTarget}
                      onArchive={setArchiveTarget}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {archived && archived.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="w-fit text-sm font-medium text-primary underline underline-offset-2"
            >
              {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
            </button>
            {showArchived && (
              <ul className="flex flex-col gap-2">
                {archived.map((topic) => (
                  <li
                    key={topic.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{topic.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
                        Archived
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => void handleRestore(topic)}
                        disabled={restoringId === topic.id}
                      >
                        Restore
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {restoreError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {restoreError}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <RenameTopicDialog
        topic={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRenamed={handleRenamed}
      />
      <ArchiveTopicDialog
        topic={archiveTarget}
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        onArchived={handleArchived}
      />
    </Card>
  );
}
