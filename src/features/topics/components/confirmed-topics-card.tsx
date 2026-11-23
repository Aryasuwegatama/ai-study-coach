"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS, STATUS_TONES, masteryDetail } from "@/features/analytics/analytics-format";
import type { MasteryStatus, TopicProgress } from "@/features/progress/progress-schemas";
import { pluralise } from "@/lib/pluralise";
import type { TopicResponse } from "../topics-schemas";
import { TopicsClientError, topicsClient } from "../client/api-topics-client";
import { ArchiveTopicDialog } from "./archive-topic-dialog";
import { RenameTopicDialog } from "./rename-topic-dialog";

/** Topics shown before the "Show all" disclosure. */
const VISIBLE_TOPICS = 5;
const STATUS_ORDER: MasteryStatus[] = ["weak", "insufficient", "not_assessed", "on_track"];

function sortByName(list: TopicResponse[]): TopicResponse[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

const ROW_CLASS = "flex items-start gap-2 border-t border-border px-6 py-4 max-sm:px-4";
const SUMMARY_CLASS =
  "flex min-h-11 cursor-pointer list-none items-center gap-2 px-6 text-sm font-semibold text-primary outline-none marker:hidden focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:px-4 [&::-webkit-details-marker]:hidden";

/** The status pill: Weak and On track show their percentage ("Weak · 20%"); the rest show the label alone. */
function statusLabel(progress: TopicProgress): string {
  const label = STATUS_LABELS[progress.status];
  return progress.percent !== null && (progress.status === "weak" || progress.status === "on_track")
    ? `${label} · ${progress.percent}%`
    : label;
}

function TopicMenu({
  topic,
  onRename,
  onArchive,
}: {
  topic: TopicResponse;
  onRename: (topic: TopicResponse) => void;
  onArchive: (topic: TopicResponse) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${topic.name}`} />}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRename(topic)}>Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onArchive(topic)}>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopicRow({
  topic,
  progress,
  onRename,
  onArchive,
}: {
  topic: TopicResponse;
  progress: TopicProgress | undefined;
  onRename: (topic: TopicResponse) => void;
  onArchive: (topic: TopicResponse) => void;
}) {
  return (
    <li className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold break-words text-foreground">{topic.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {progress ? (
            <>
              <Badge tone={STATUS_TONES[progress.status]}>{statusLabel(progress)}</Badge>
              <p className="text-sm text-muted-foreground">
                {masteryDetail(progress)}
                {progress.mistakes > 0 && ` · ${pluralise(progress.mistakes, "mistake")}`}
              </p>
            </>
          ) : (
            <Badge tone="neutral">{STATUS_LABELS.not_assessed}</Badge>
          )}
        </div>
      </div>
      <TopicMenu topic={topic} onRename={onRename} onArchive={onArchive} />
    </li>
  );
}

/** A confirmed topic whose materials were all deleted: its history stays, but there is nothing to practise from. */
function UnlinkedTopicRow({
  topic,
  onRename,
  onArchive,
}: {
  topic: TopicResponse;
  onRename: (topic: TopicResponse) => void;
  onArchive: (topic: TopicResponse) => void;
}) {
  return (
    <li className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold break-words text-foreground">{topic.name}</h3>
        <p className="text-sm text-muted-foreground">Past practice history kept</p>
      </div>
      <Badge tone="neutral" className="mt-1 shrink-0">
        No material
      </Badge>
      <TopicMenu topic={topic} onRename={onRename} onArchive={onArchive} />
    </li>
  );
}

/**
 * Overview's "Your topics" card (`#topics-title` in the redesign prototype):
 * the confirmed topics with their mastery status, then disclosures for
 * archived topics and for topics whose materials were all deleted
 * (Arya, 2026-11-19: a topic with quiz or flashcard history is never deleted
 * with its last material; it lands in the second group and relinks
 * automatically when a material with the same name is next confirmed).
 *
 * Mastery comes from `progressByTopic` (the space's `TopicProgress`, keyed by
 * topic ID), so renaming a topic needs no refetch. There is no "Add topic"
 * here: a topic with no material can't be practised, so topics are added on
 * Confirm topics only.
 *
 * `initialLinkedTopics`/`initialUnlinkedTopics` are the server's
 * confirmed-only lists (`?materials=linked`/`unlinked`); archived topics
 * are fetched client-side once so the Overview page itself only ever
 * loads confirmed topics.
 */
export function ConfirmedTopicsCard({
  spaceId,
  initialLinkedTopics,
  initialUnlinkedTopics,
  progressByTopic,
  hasMaterialAwaitingReview,
}: {
  spaceId: string;
  initialLinkedTopics: TopicResponse[];
  initialUnlinkedTopics: TopicResponse[];
  progressByTopic: Record<string, TopicProgress>;
  hasMaterialAwaitingReview: boolean;
}) {
  const [linkedTopics, setLinkedTopics] = useState<TopicResponse[]>(() => sortByName(initialLinkedTopics));
  const [unlinkedTopics, setUnlinkedTopics] = useState<TopicResponse[]>(() => sortByName(initialUnlinkedTopics));
  const [archived, setArchived] = useState<TopicResponse[] | null>(null);
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

  const shownTopics = linkedTopics.slice(0, VISIBLE_TOPICS);
  const moreTopics = linkedTopics.slice(VISIBLE_TOPICS);
  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    n: linkedTopics.filter((topic) => progressByTopic[topic.id]?.status === status).length,
  })).filter((entry) => entry.n > 0);

  const renderRow = (topic: TopicResponse) => (
    <TopicRow
      key={topic.id}
      topic={topic}
      progress={progressByTopic[topic.id]}
      onRename={setRenameTarget}
      onArchive={setArchiveTarget}
    />
  );

  return (
    <Card role="region" aria-labelledby="topics-title" className="gap-0 p-0">
      <header className="p-6 pb-4 max-sm:p-4">
        <h2 id="topics-title" className="flex items-center gap-2 text-card-title text-foreground">
          Your topics <CountChip count={linkedTopics.length} />
        </h2>
        <p className="text-sm text-muted-foreground">Confirmed and available for practice</p>
      </header>

      {linkedTopics.length === 0 ? (
        <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground max-sm:px-4">
          No confirmed topics yet.{" "}
          {hasMaterialAwaitingReview ? (
            <>
              <Link
                href={`/spaces/${spaceId}/materials`}
                className="font-semibold text-primary underline underline-offset-4"
              >
                Confirm topics
              </Link>{" "}
              from a material to add them here.
            </>
          ) : (
            "Upload a material and confirm its topics to add them here."
          )}
        </p>
      ) : (
        <>
          {statusCounts.length > 0 && (
            <ul aria-label="Topics by status" className="flex flex-wrap gap-2 px-6 pb-4 max-sm:px-4">
              {statusCounts.map(({ status, n }) => (
                <li key={status}>
                  <Badge tone={STATUS_TONES[status]}>
                    {n} {STATUS_LABELS[status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <ul>{shownTopics.map(renderRow)}</ul>
          {moreTopics.length > 0 && (
            <details className="group border-t border-border">
              <summary className={SUMMARY_CLASS}>
                <span className="group-open:hidden">Show all {linkedTopics.length} topics</span>
                <span className="hidden group-open:inline">Show fewer topics</span>
                <ChevronDown className="ml-auto size-5 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul>{moreTopics.map(renderRow)}</ul>
            </details>
          )}
          <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground max-sm:px-4">
            Mastery uses the latest 10 scored quiz questions per topic. Fewer than 5 shows &ldquo;Not enough
            evidence&rdquo;.
          </p>
        </>
      )}

      {archived !== null && (
        <details className="group border-t border-border">
          <summary className={SUMMARY_CLASS}>
            Archived topics <CountChip count={archived.length} />
            <ChevronDown className="ml-auto size-5 group-open:rotate-180" aria-hidden="true" />
          </summary>
          {archived.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground max-sm:px-4">
              No archived topics. You can archive a topic from its actions menu.
            </p>
          ) : (
            <ul>
              {archived.map((topic) => (
                <li key={topic.id} className={`${ROW_CLASS} items-center`}>
                  <h3 className="min-w-0 flex-1 font-semibold break-words text-muted-foreground">{topic.name}</h3>
                  <Badge tone="neutral" className="shrink-0">
                    Archived
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRestore(topic)}
                    disabled={restoringId === topic.id}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {restoreError && (
            <p role="alert" className="px-6 pb-4 text-sm font-semibold text-destructive max-sm:px-4">
              {restoreError}
            </p>
          )}
        </details>
      )}

      {unlinkedTopics.length > 0 && (
        <details className="group border-t border-border">
          <summary className={SUMMARY_CLASS}>
            Topics from deleted materials <CountChip count={unlinkedTopics.length} />
            <ChevronDown className="ml-auto size-5 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="px-6 pb-3 text-sm text-muted-foreground max-sm:px-4">
            You made quizzes or flashcards from these topics, so their results stay in your progress. Upload a material
            that covers them to use them again.
          </p>
          <ul>
            {unlinkedTopics.map((topic) => (
              <UnlinkedTopicRow key={topic.id} topic={topic} onRename={setRenameTarget} onArchive={setArchiveTarget} />
            ))}
          </ul>
        </details>
      )}

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
