import Link from "next/link";

/**
 * Shown when `requireSpace()` or `requireMaterial()` fails to resolve this
 * page (missing, deleted, malformed, someone else's, or the material's
 * `spaceId` not matching the URL's `spaceId`). No space or material
 * details ever reach this component; it doesn't take any.
 */
export default function TopicsReviewNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-foreground">Not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This material may have been deleted, or it might belong to someone else.
      </p>
      <Link
        href="/spaces"
        className="text-sm font-medium text-primary underline underline-offset-2"
      >
        Back to Study Spaces
      </Link>
    </div>
  );
}
