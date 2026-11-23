import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** No decks in this space yet (same empty-state pattern as Quizzes). */
export function DecksEmptyState({ spaceId }: { spaceId: string }) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-soft-purple text-purple">
        <Layers className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-card-title text-foreground">No flashcards yet</h3>
      <p className="max-w-[42rem] text-muted-foreground">
        Create a deck from your ready materials and confirmed topics to start practising.
      </p>
      <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards/new`} />}>
        <Plus aria-hidden="true" />
        Create flashcards
      </Button>
    </Card>
  );
}
