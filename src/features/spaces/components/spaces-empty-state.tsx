import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * A student with no Study Spaces yet (`.empty` in the redesign prototype).
 * The button links to `/spaces?create=1`, which opens the one Create
 * dialog `SpacesPageHeader` owns, so there is a single dialog to maintain.
 */
export function SpacesEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
        <Folder className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-card-title text-foreground">{title}</h2>
      <p className="max-w-[42rem] text-muted-foreground">{body}</p>
      <Button nativeButton={false} render={<Link href="/spaces?create=1" />}>
        <Plus aria-hidden="true" />
        Create study space
      </Button>
    </Card>
  );
}
