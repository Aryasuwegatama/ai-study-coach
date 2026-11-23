import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** No quizzes in this space yet (redesign prototype `quiz-library.html`, empty state). */
export function QuizzesEmptyState({ spaceId }: { spaceId: string }) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
        <ListChecks className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-card-title text-foreground">No quizzes yet</h3>
      <p className="max-w-[42rem] text-muted-foreground">
        Create a quiz from your ready materials and confirmed topics to start practising.
      </p>
      <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
        <Plus aria-hidden="true" />
        Create quiz
      </Button>
    </Card>
  );
}
