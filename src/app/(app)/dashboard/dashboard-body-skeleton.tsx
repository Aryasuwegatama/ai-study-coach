import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpacesCardGridSkeleton } from "@/features/spaces/components/spaces-card-grid-skeleton";

/** Suspense fallback for everything under the welcome card: the four numbers, then the two columns. */
export function DashboardBodySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading your dashboard.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((key) => (
          <Card key={key} className="flex-row items-center gap-4 px-6 py-5">
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-4 w-28" />
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-8 w-56" />
          <SpacesCardGridSkeleton layout="list" />
        </div>
        <Card className="gap-4 p-6" aria-hidden="true">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <Skeleton className="h-6 w-3/5" />
          </div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-11 w-36" />
        </Card>
      </div>
    </div>
  );
}
