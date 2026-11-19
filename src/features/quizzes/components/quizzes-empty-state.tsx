import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Figma node 49:18286, "Quiz Library, empty". */
export function QuizzesEmptyState({ spaceId }: { spaceId: string }) {
  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-soft-purple text-purple">
          <ListChecks className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">No quizzes yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate a quiz from your Ready materials and confirmed topics to start practising.
          </p>
        </div>
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes/new`} />}>
          Generate quiz
        </Button>
      </CardContent>
    </Card>
  );
}
