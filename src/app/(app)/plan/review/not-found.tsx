import Link from "next/link";

/**
 * Shown when the topic or Study Space in the link isn't the student's (or
 * doesn't exist, or the link is incomplete). Nothing about it reaches this
 * component.
 */
export default function ReviewMistakesNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-foreground">Nothing to review here</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The topic or study space may have been removed, or it might belong to someone else.
      </p>
      <Link href="/analytics" className="text-sm font-medium text-primary underline underline-offset-2">
        Back to Analytics
      </Link>
    </div>
  );
}
