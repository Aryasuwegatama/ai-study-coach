import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { UnfinishedDeck, UnfinishedQuiz } from "@/features/plan/server";

/**
 * The Resume card (replaces Figma node 80:6946's "Continue Studying" card):
 * whichever unfinished quiz or flashcard deck the student touched last. Shown
 * only when there is one. A deck shows how many cards are rated, never a date.
 */
export function DashboardResume({ resume }: { resume: UnfinishedQuiz | UnfinishedDeck | null }) {
  if (!resume) return null;
  const isQuiz = resume.kind === "quiz";
  const done = isQuiz ? resume.answered : resume.rated;
  const label = isQuiz ? `${done} of ${resume.total} answered` : `${done} of ${resume.total} rated`;
  const percent = resume.total > 0 ? Math.round((done / resume.total) * 100) : 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">{isQuiz ? "Resume quiz" : "Resume flashcards"}</h2>
      <Card className="flex-col gap-4 rounded-[20px] p-6 sm:flex-row sm:items-center sm:gap-6">
        <CardContent className="flex flex-1 flex-col gap-2 p-0">
          <p className="text-base font-semibold text-foreground">{resume.title}</p>
          <p className="text-sm text-muted-foreground">
            {resume.spaceName} · {label}
          </p>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={resume.total}
            aria-valuenow={done}
            className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </CardContent>
        <Button type="button" className="w-fit rounded-full" nativeButton={false} render={<Link href={resume.href} />}>
          Resume
        </Button>
      </Card>
    </section>
  );
}
