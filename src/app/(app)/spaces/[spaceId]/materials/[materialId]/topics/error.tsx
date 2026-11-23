"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown when the suggestions can't be loaded, for example the database being
 * unreachable (the same case `(app)/error.tsx` handles for every other page,
 * with wording for this one). "Not found" never reaches this screen. The
 * shell around it stays usable.
 */
export default function TopicsReviewError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[78rem] flex-col px-4 py-6 sm:p-8">
      <Card role="alert" className="gap-4 p-6">
        <h1 className="text-card-title text-foreground">We couldn&apos;t load the topic suggestions</h1>
        <p className="text-muted-foreground">
          Check your connection and try again. Your uploaded material is still there.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
