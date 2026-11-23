import Link from "next/link";
import { Layers, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import type { UnfinishedDeck, UnfinishedQuiz } from "@/features/plan/server";

/**
 * Overview's "Continue studying" card: the most recently touched unfinished
 * quiz or flashcard deck in this space (the caller picks it, same tie-break
 * as the Dashboard). Hidden when there is nothing to resume.
 */
export function SpaceOverviewResume({
  spaceId,
  resume,
}: {
  spaceId: string;
  resume: UnfinishedQuiz | UnfinishedDeck | null;
}) {
  if (!resume) return null;
  const isQuiz = resume.kind === "quiz";
  const done = isQuiz ? resume.answered : resume.rated;
  const label = isQuiz ? `${done} of ${resume.total} questions answered` : `${done} of ${resume.total} cards rated`;
  const Icon = isQuiz ? ListChecks : Layers;

  return (
    <Card role="region" aria-labelledby="resume-title" className="gap-4 p-6 max-sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Pick up where you left off</p>
          <h2 id="resume-title" className="text-section text-foreground">
            Continue studying
          </h2>
        </div>
        <Badge tone="blue">In progress</Badge>
      </header>
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold break-words text-foreground">{resume.title}</h3>
          <p className="text-sm text-muted-foreground">
            {isQuiz ? "Quiz" : "Flashcards"} · {resume.total} {isQuiz ? "questions" : "cards"}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <LabelledProgressBar value={done} max={resume.total} label={isQuiz ? "Questions answered" : "Cards rated"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={resume.href} />}>
          {isQuiz ? "Resume quiz" : "Resume flashcards"}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards/new`} />}>
          Create flashcards
        </Button>
      </div>
    </Card>
  );
}
