import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown instead of the Library when the first load of the list fails
 * (T-09b plan step 4, "List errors") — a network drop or a 500, not an
 * empty space. "Try again" calls the hook's `refresh()` directly.
 */
export function MaterialsListError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card role="alert" className="mt-8 gap-4 p-6">
      <h3 className="text-card-title text-foreground">We couldn&apos;t load your materials</h3>
      <p className="text-muted-foreground">Your files are still saved. Check your connection and try again.</p>
      <div>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
