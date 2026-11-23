import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DashboardSummary } from "../server/dashboard-service";

/**
 * "Your topics are ready": the most recent material whose suggested topics
 * are waiting to be confirmed, with a link straight to Confirm topics. Shown
 * only when there is one; any others are one click away in My Plan.
 */
export function DashboardTopicsReady({ topicsReady }: { topicsReady: DashboardSummary["topicsReady"] }) {
  const { latest, count } = topicsReady;
  if (!latest) return null;

  return (
    <Card role="region" aria-labelledby="topics-ready-title" className="gap-2 p-6 max-[420px]:p-4">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-soft-amber text-amber">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="topics-ready-title" className="text-card-title text-foreground">
            Your topics are ready
          </h3>
          <p className="text-sm break-words text-muted-foreground">{latest.spaceName}</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        We found topic suggestions in <span className="font-semibold break-words">{latest.fileName}</span>. Choose what
        you want to study.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/spaces/${latest.spaceId}/materials/${latest.materialId}/topics`} />}
        >
          Confirm topics
        </Button>
        {count > 1 && (
          <Link href="/plan" className="text-sm font-semibold text-primary underline underline-offset-4">
            +{count - 1} more
          </Link>
        )}
      </div>
    </Card>
  );
}
