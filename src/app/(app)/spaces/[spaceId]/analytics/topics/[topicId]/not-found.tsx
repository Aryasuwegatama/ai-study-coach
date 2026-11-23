import Link from "next/link";

/**
 * Shown for a topic that doesn't exist, isn't the student's, or isn't in the
 * space named in the URL. Nothing about the topic reaches this component.
 */
export default function TopicAnalyticsNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-foreground">Topic not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have been removed, or it might belong to someone else.
      </p>
      <Link href="/spaces" className="text-sm font-medium text-primary underline underline-offset-2">
        Back to Study Spaces
      </Link>
    </div>
  );
}
