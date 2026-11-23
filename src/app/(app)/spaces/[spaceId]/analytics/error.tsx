"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown when a space's Analytics or one of its topic pages can't be loaded, for example the database being unreachable. It sits inside the `(app)` shell, so the sidebar and top bar
 * stay usable. "Not found" and sign-in redirects never reach this screen.
 */
export default function SpaceAnalyticsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[78rem] flex-col px-4 py-6 sm:p-8">
      <Card role="alert" className="gap-4 p-6">
        <h1 className="text-card-title text-foreground">We couldn&apos;t load analytics for this space</h1>
        <p className="text-muted-foreground">Your quiz answers are still saved. Check your connection and try again.</p>
        <div>
          <Button type="button" variant="outline" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
