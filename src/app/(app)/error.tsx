"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error screen for every signed-in page. It sits inside the `(app)` shell,
 * so the sidebar and top bar stay usable. Shown for unexpected failures,
 * such as the database being unreachable. "Not found" and sign-in
 * redirects never reach this screen.
 *
 * In production, Next.js replaces a Server Component's error message with
 * a generic one plus a `digest` ID, so nothing sensitive is shown here.
 * The digest matches the server logs.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center"
    >
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <div className="flex items-center gap-4">
        <Button type="button" className="rounded-full" onClick={() => retry()}>
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
