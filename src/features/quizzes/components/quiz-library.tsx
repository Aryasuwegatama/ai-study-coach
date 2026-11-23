"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ListChecks, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralise } from "@/lib/pluralise";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SetListItemResponse } from "../quizzes-schemas";
import { QuizzesEmptyState } from "./quizzes-empty-state";

const ATTEMPT_LABELS = { none: "Not started", in_progress: "In progress", submitted: "Completed" } as const;
const ATTEMPT_TONES = { none: "neutral", in_progress: "amber", submitted: "green" } as const;

function QuizStatusPill({ quiz }: { quiz: SetListItemResponse }) {
  if (quiz.status === "generating") return <Badge tone="amber">Generating</Badge>;
  if (quiz.status === "failed") return <Badge tone="red">Generation failed</Badge>;
  return <Badge tone={ATTEMPT_TONES[quiz.latestAttempt.status]}>{ATTEMPT_LABELS[quiz.latestAttempt.status]}</Badge>;
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
  quiz: SetListItemResponse;
  onDelete: (quiz: SetListItemResponse) => void;
}) {
  // A quiz can be deleted whatever its generation status (failed, still
  // generating, never attempted or only in progress); only a submitted
  // attempt blocks it (PRD Section 2 and #35: `SET_HAS_RESULTS`) — any
  // submitted attempt, including one before a retake that's now in
  // progress, which is why this reads `hasResults`, not `latestAttempt`.
  const canDelete = !quiz.hasResults;
  const attemptHref = `/spaces/${spaceId}/quizzes/${quiz.id}`;

  // A ready quiz can still have no active questions left (every one was
  // removed by a report): starting a new attempt would hit
  // `SET_NO_ACTIVE_QUESTIONS`, so Start/Retake are replaced by that
  // message. Resuming an existing in-progress attempt is unaffected — its
  // questions were already chosen before any of them were removed.
  const noActiveQuestions = quiz.status === "ready" && quiz.activeCount === 0 && quiz.latestAttempt.status !== "in_progress";

  let primary: ReactNode = null;
  if (quiz.status === "failed") {
    primary = (
      <Button variant="outline" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new?retry=${quiz.id}`} />}>
        Try again
      </Button>
    );
  } else if (noActiveQuestions) {
    primary =
      quiz.latestAttempt.status === "submitted" ? (
        <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/${quiz.id}/results/${quiz.latestAttempt.attemptId}`} />}>
          View results
        </Button>
      ) : null;
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "none") {
    primary = (
      <Button nativeButton={false} render={<Link href={attemptHref} />}>
        Start quiz
      </Button>
    );
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "in_progress") {
    primary = (
      <Button nativeButton={false} render={<Link href={attemptHref} />}>
        Resume quiz
      </Button>
    );
  } else if (quiz.status === "ready" && quiz.latestAttempt.status === "submitted") {
    primary = (
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/${quiz.id}/results/${quiz.latestAttempt.attemptId}`} />}>
          View results
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={attemptHref} />}>
          Retake
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">{primary}</div>
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${quiz.title}`} />}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(quiz)}>
              <Trash2 aria-hidden="true" />
              Delete quiz
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** The line under the title: what the quiz holds, or why it isn't ready. */
function quizMeta(quiz: SetListItemResponse): string {
  if (quiz.status === "generating") return "Preparing your questions. You can keep studying.";
  if (quiz.status === "failed") return quiz.error?.message ?? "We couldn't generate this quiz. Try again.";
  const removed = quiz.generatedCount - quiz.activeCount;
  if (quiz.activeCount === 0 && quiz.latestAttempt.status !== "in_progress") return "No questions available for a new attempt.";
  const parts = [pluralise(quiz.generatedCount, "question")];
  if (quiz.generatedCount < quiz.requestedCount) parts.push(`${quiz.generatedCount} of ${quiz.requestedCount} generated`);
  if (removed > 0) parts.push(`${removed} removed after a report`);
  return parts.join(" · ");
}

/** A second, quieter line for the special cases (partial, removed, none left). */
function quizNote(quiz: SetListItemResponse): string | null {
  if (quiz.status !== "ready") return null;
  const submitted = quiz.latestAttempt.status === "submitted";
  if (quiz.activeCount === 0 && quiz.latestAttempt.status !== "in_progress") return submitted ? "You can still view your previous result." : null;
  if (submitted && quiz.generatedCount > quiz.activeCount) return "Your previous result is kept. The next attempt uses the remaining questions.";
  if (quiz.latestAttempt.status === "none" && quiz.generatedCount < quiz.requestedCount) return "You can start with the questions that are ready.";
  return null;
}

/**
 * One quiz (`.quiz-card` in the redesign prototype): its icon and status,
 * title, what it holds, its progress or latest score, then its actions.
 */
function QuizCard({
  spaceId,
  quiz,
  onDelete,
}: {
  spaceId: string;
  quiz: SetListItemResponse;
  onDelete: (quiz: SetListItemResponse) => void;
}) {
  const note = quizNote(quiz);
  const titleId = `quiz-${quiz.id}-title`;
  return (
    <Card className="gap-4 p-6 max-sm:p-4" aria-labelledby={titleId} role="article">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <QuizStatusPill quiz={quiz} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-card-title break-words text-foreground">
          {quiz.title}
        </h3>
        <p className="text-sm text-muted-foreground">{quizMeta(quiz)}</p>
      </div>

      {quiz.status === "ready" && quiz.latestAttempt.status === "in_progress" && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground" aria-hidden="true">
            {quiz.latestAttempt.answeredCount} of {quiz.latestAttempt.totalCount} answered
          </p>
          <LabelledProgressBar
            value={quiz.latestAttempt.answeredCount}
            max={quiz.latestAttempt.totalCount}
            label={`${quiz.latestAttempt.answeredCount} of ${quiz.latestAttempt.totalCount} answered`}
          />
        </div>
      )}
      {quiz.status === "ready" && quiz.latestAttempt.status === "submitted" && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-muted-foreground">Latest score</span>
          <span className="font-semibold text-foreground">
            {quiz.latestAttempt.score} of {quiz.latestAttempt.total}
          </span>
          <span className="text-sm text-muted-foreground">({quiz.latestAttempt.percent}%)</span>
        </p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      <div className="mt-auto">
        <QuizCardActions spaceId={spaceId} quiz={quiz} onDelete={onDelete} />
      </div>
    </Card>
  );
}

function QuizLibrarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your quizzes.
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
 * The Quiz Library (issue #46; redesign prototype `quiz-library.html`): a
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
  quizzes: SetListItemResponse[];
  loading: boolean;
  actionError?: string | null;
  onDelete: (quiz: SetListItemResponse) => void;
}) {
  return (
    <section aria-labelledby="quizzes-heading" className="mt-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="quizzes-heading" className="flex items-center gap-2 text-section text-foreground">
            Quizzes {!loading && <CountChip count={quizzes.length} />}
          </h2>
          <p className="mt-1 max-w-[42rem] text-muted-foreground">Practise with quizzes made from your confirmed topics.</p>
        </div>
        {!loading && quizzes.length > 0 && (
          <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
            <Plus aria-hidden="true" />
            Create quiz
          </Button>
        )}
      </header>

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
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {quizzes.map((quiz) => (
              <li key={quiz.id} className="flex [&>*]:flex-1">
                <QuizCard spaceId={spaceId} quiz={quiz} onDelete={onDelete} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Answers and explanations appear after you submit a quiz.</p>
        </>
      )}
    </section>
  );
}
