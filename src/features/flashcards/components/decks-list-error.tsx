import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown instead of the Deck Library when the first load of the list fails
 * (same pattern as `quizzes-list-error.tsx`). "Try again" calls the hook's `refresh()`. */
export function DecksListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">Couldn&apos;t load your flashcards</h3>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {message}
          </p>
        </div>
        <Button type="button" className="rounded-full" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
