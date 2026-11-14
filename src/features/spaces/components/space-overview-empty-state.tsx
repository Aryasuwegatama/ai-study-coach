import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Welcome to {name}" empty state (T-05 plan step 6; T-09a enables
 * "Upload material"). It links to the Materials page's upload dialog
 * (`?upload=1`, the same pattern as `/spaces?create=1`) rather than
 * opening a dialog here — Materials owns that dialog and its data. No
 * material/topic counts or EXAMPLE DATA badge here — there is nothing to
 * count yet, and this screen is real data, not a sample (scope: "A
 * populated Overview with material and topic counts: later").
 */
export function SpaceOverviewEmptyState({ spaceId, name }: { spaceId: string; name: string }) {
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
        <Button
          type="button"
          className="rounded-full"
          nativeButton={false}
          render={<Link href={`/spaces/${spaceId}/materials?upload=1`} />}
        >
          Upload material
        </Button>
      </CardContent>
    </Card>
  );
}
