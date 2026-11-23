import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Overview for a space with no materials and no topics (`.empty` in the
 * redesign prototype). It links to the Materials page's upload dialog
 * (`?upload=1`, the same pattern as `/spaces?create=1`) rather than opening a
 * dialog here: Materials owns that dialog and its data. There is no manual
 * "Add a topic" here, because a topic with no material can't be practised.
 */
export function SpaceOverviewEmptyState({ spaceId }: { spaceId: string }) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
        <Upload className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-card-title text-foreground">Make this space your own</h2>
      <p className="max-w-[42rem] text-muted-foreground">
        Upload your notes or slides. We&apos;ll suggest topics for you to confirm before you start practising.
      </p>
      <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials?upload=1`} />}>
        Upload your first material
      </Button>
    </Card>
  );
}
