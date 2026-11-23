import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shown instead of the Deck Library when the first load fails; "Try again" calls the hook's `refresh()`. */
export function DecksListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card role="alert" className="mt-6 gap-4 p-6 max-sm:p-4">
      <h2 className="text-card-title text-foreground">We couldn&apos;t load your flashcards</h2>
      <p className="text-muted-foreground">{message} Check your connection and try again.</p>
      <div>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </div>
    </Card>
  );
}
