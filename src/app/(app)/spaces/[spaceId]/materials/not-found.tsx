import Link from "next/link";

/**
 * Shown when `requireSpace()` fails to resolve this space (missing,
 * deleted, malformed or someone else's ID), the same as
 * `overview/not-found.tsx`. No space details ever reach this component;
 * it doesn't take any.
 */
export default function MaterialsNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-foreground">Study space not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have been deleted, or it might belong to someone else.
      </p>
      <Link
        href="/spaces"
        className="text-sm font-medium text-primary underline underline-offset-2"
      >
        Back to My Study Spaces
      </Link>
    </div>
  );
}
