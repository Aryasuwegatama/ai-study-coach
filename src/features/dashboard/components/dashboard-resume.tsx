import Link from "next/link";
import { Layers, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LabelledProgressBar } from "@/components/labelled-progress-bar";
import type { UnfinishedDeck, UnfinishedQuiz } from "@/features/plan/server";

/**
 * "Continue studying" (`.resource` in the redesign prototype): whichever
 * unfinished quiz or flashcard deck the student touched last. Shown only
 * when there is one. A deck shows how many cards are rated, never a date.
 */
export function DashboardResume({ resume }: { resume: UnfinishedQuiz | UnfinishedDeck | null }) {
  if (!resume) return null;
  const isQuiz = resume.kind === "quiz";
  const done = isQuiz ? resume.answered : resume.rated;
  const label = isQuiz ? `${done} of ${resume.total} questions answered` : `${done} of ${resume.total} cards rated`;
  const Icon = isQuiz ? ListChecks : Layers;

  return (
    <section aria-labelledby="continue-title">
      <h2 id="continue-title" className="mb-4 flex min-h-11 items-center text-section text-foreground">
        Continue studying
      </h2>
      <Card className="gap-0 p-6 max-[420px]:p-4">
        <Badge tone="blue" className="mb-4">
          In progress
        </Badge>
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-soft-green text-green">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-card-title break-words text-foreground">{resume.title}</h3>
            <p className="text-sm text-muted-foreground">
              {resume.spaceName} · {isQuiz ? "Quiz" : "Flashcards"}
            </p>
          </div>
        </div>
        <LabelledProgressBar
          className="mt-4"
          value={done}
          max={resume.total}
          label={isQuiz ? "Questions answered" : "Cards rated"}
        />
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
        <Button className="mt-4 w-fit" nativeButton={false} render={<Link href={resume.href} />}>
          {isQuiz ? "Resume quiz" : "Resume flashcards"}
        </Button>
      </Card>
    </section>
  );
}
