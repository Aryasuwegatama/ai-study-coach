import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { UnfinishedQuiz } from "@/features/plan/server";

/**
 * "Resume quiz" (replaces Figma node 80:6946's "Continue Studying" card;
 * flashcards don't exist yet): the student's most recent unfinished quiz.
 * Shown only when there is one.
 */
export function DashboardResumeQuiz({ quiz }: { quiz: UnfinishedQuiz | null }) {
  if (!quiz) return null;
  const percent = quiz.total > 0 ? Math.round((quiz.answered / quiz.total) * 100) : 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Resume quiz</h2>
      <Card className="flex-col gap-4 rounded-[20px] p-6 sm:flex-row sm:items-center sm:gap-6">
        <CardContent className="flex flex-1 flex-col gap-2 p-0">
          <p className="text-base font-semibold text-foreground">{quiz.title}</p>
          <p className="text-sm text-muted-foreground">
            {quiz.spaceName} · {quiz.answered} of {quiz.total} answered
          </p>
          <div
            role="progressbar"
            aria-label={`${quiz.answered} of ${quiz.total} answered`}
            aria-valuemin={0}
            aria-valuemax={quiz.total}
            aria-valuenow={quiz.answered}
            className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </CardContent>
        <Button type="button" className="w-fit rounded-full" nativeButton={false} render={<Link href={quiz.href} />}>
          Resume
        </Button>
      </Card>
    </section>
  );
}
