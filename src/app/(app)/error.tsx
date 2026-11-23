"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card role="alert" className="w-full max-w-md gap-4 p-6 text-left">
        <h1 className="text-card-title text-foreground">We couldn&apos;t load this page</h1>
        <p className="text-sm text-muted-foreground">
          Your saved study work is still there. Check your connection and try again.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="outline" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            Go to Dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
