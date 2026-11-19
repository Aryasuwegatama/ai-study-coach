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
import type { SetWithLatestAttempt } from "../fixtures/quizzes-sample-types";
import { QuizzesEmptyState } from "./quizzes-empty-state";

const ATTEMPT_LABELS = { none: "Not started", in_progress: "In progress", submitted: "Completed" } as const;
const ATTEMPT_CLASSES = {
  none: "bg-muted text-muted-foreground",
  in_progress: "bg-soft-amber text-amber",
  submitted: "bg-soft-green text-green",
} as const;

function QuizStatusPill({ quiz }: { quiz: SetWithLatestAttempt }) {
  if (quiz.status === "generating") {
    return (
      <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-soft-amber px-3 text-xs font-semibold text-amber">
        Generating
      </span>
    );
  }
  if (quiz.status === "failed") {
    return (
      <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-destructive/10 px-3 text-xs font-semibold text-destructive">
        Generation failed
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-7 w-fit shrink-0 items-center rounded-full px-3 text-xs font-semibold ${ATTEMPT_CLASSES[quiz.latestAttempt.status]}`}
    >
      {ATTEMPT_LABELS[quiz.latestAttempt.status]}
    </span>
  );
}

/**
 * The primary action(s) plus the "⋯" menu (issue #46, "Library card
 * actions"). Delete is the menu's only item and only shows for a quiz
 * with no submitted attempt (PRD Section 2 and #35); there's nothing
 * else to put in a menu otherwise, so the whole trigger is left out.
 */
function QuizCardActions({
  spaceId,
  quiz,
  onDelete,
}: {
  spaceId: string;
  quiz: SetWithLatestAttempt;
  onDelete: (quiz: SetWithLatestAttempt) => void;
}) {
  // A quiz can be deleted whatever its generation status (failed, still
  // generating, never attempted or only in progress); only a submitted
  // attempt blocks it (PRD Section 2 and #35: `SET_HAS_RESULTS`) — any
  // submitted attempt, including one before a retake that's now in
  // progress, which is why this reads `hasResults`, not `latestAttempt`.
  const canDelete = !quiz.hasResults;
  const attemptHref = `/spaces/${spaceId}/quizzes/${quiz.id}`;

  let primary: ReactNode = null;
  if (quiz.status === "failed") {
    primary = (
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        nativeButton={false}
        render={<Link href={`/spaces/${spaceId}/quizzes/new?retry=${quiz.id}`} />}
      >
        Try again
      </Button>
    );
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "none") {
    primary = (
      <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={attemptHref} />}>
        Start quiz
      </Button>
    );
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "in_progress") {
    primary = (
      <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={attemptHref} />}>
        Resume
      </Button>
    );
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "submitted") {
    primary = (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-full"
          nativeButton={false}
          render={<Link href={`/spaces/${spaceId}/quizzes/${quiz.id}/results/${quiz.latestAttempt.attemptId}`} />}
        >
          View results
        </Button>
        <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={attemptHref} />}>
          Retake
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary}
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${quiz.title}`} />}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(quiz)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function QuizCard({
  spaceId,
  quiz,
  onDelete,
}: {
  spaceId: string;
  quiz: SetWithLatestAttempt;
  onDelete: (quiz: SetWithLatestAttempt) => void;
}) {
  return (
    <Card className="flex flex-col rounded-[20px] p-5">
      <CardContent className="flex flex-1 flex-col gap-3 p-0">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground">{quiz.title}</h3>
        <QuizStatusPill quiz={quiz} />

        {quiz.status === "ready" && quiz.generatedCount < quiz.requestedCount && (
          <p className="text-xs text-muted-foreground">
            {quiz.generatedCount} of {quiz.requestedCount} generated
          </p>
        )}
        {quiz.status === "failed" && quiz.error && <p className="text-xs text-muted-foreground">{quiz.error.message}</p>}
        {quiz.status === "ready" && quiz.latestAttempt.status === "in_progress" && (
          <p className="text-xs text-muted-foreground">
            {quiz.latestAttempt.answeredCount} of {quiz.latestAttempt.totalCount} answered
          </p>
        )}
        {quiz.status === "ready" && quiz.latestAttempt.status === "submitted" && (
          <p className="text-xs text-muted-foreground">
            Score: {quiz.latestAttempt.score} of {quiz.latestAttempt.total} ({quiz.latestAttempt.percent}%)
          </p>
        )}

        <div className="mt-auto pt-2">
          <QuizCardActions spaceId={spaceId} quiz={quiz} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

function QuizLibrarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-44 w-full rounded-[20px]" />
      ))}
    </div>
  );
}

/**
 * The Quiz Library (issue #46, plan step 4; Figma nodes 49:18466
 * populated, 49:18286 empty, 49:18844 generating, 49:18869 failed). A
 * grid of cards, not a table — each status needs a different action
 * layout, which fits a card better than a shared row shape.
 */
export function QuizLibrary({
  spaceId,
  quizzes,
  loading,
  actionError,
  onDelete,
}: {
  spaceId: string;
  quizzes: SetWithLatestAttempt[];
  loading: boolean;
  actionError?: string | null;
  onDelete: (quiz: SetWithLatestAttempt) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">Quizzes · {quizzes.length}</h2>
          <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-primary">
            EXAMPLE DATA
          </span>
        </div>
        {!loading && quizzes.length > 0 && (
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
            Generate quiz
          </Button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {actionError}
        </p>
      )}

      {loading ? (
        <QuizLibrarySkeleton />
      ) : quizzes.length === 0 ? (
        <QuizzesEmptyState spaceId={spaceId} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <QuizCard key={quiz.id} spaceId={spaceId} quiz={quiz} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
