import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Welcome to {name}" empty state (plan step 6). "Upload material" stays
 * disabled until T-09 builds Materials; no material/topic counts or
 * EXAMPLE DATA badge here — there is nothing to count yet, and this
 * screen is real data, not a sample.
 */
export function SpaceOverviewEmptyState({ name }: { name: string }) {
  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-5 p-0 text-center">
        <h2 className="text-xl font-semibold text-foreground">Welcome to {name}</h2>
        <ol className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:gap-8">
          <li className="flex flex-col gap-1">
            <span className="font-semibold text-foreground">1. Upload materials</span>
            Add a PDF, PPTX or TXT to get started.
          </li>
          <li className="flex flex-col gap-1">
            <span className="font-semibold text-foreground">2. Confirm topics</span>
            Review the AI-suggested topics once processing finishes.
          </li>
          <li className="flex flex-col gap-1">
            <span className="font-semibold text-foreground">3. Practise</span>
            Generate quizzes and flashcards from confirmed topics.
          </li>
        </ol>
        <Button type="button" disabled aria-disabled="true" className="rounded-full">
          Upload material
        </Button>
      </CardContent>
    </Card>
  );
}
