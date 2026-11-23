import Link from "next/link";

/** Shown when the space or the deck can't be resolved (missing, deleted, malformed, someone else's, or not a deck). */
export default function PracticeNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-foreground">Flashcards not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have been deleted, or it might belong to someone else.
      </p>
      <Link href="/spaces" className="text-sm font-medium text-primary underline underline-offset-2">
        Back to Study Spaces
      </Link>
    </div>
  );
}
