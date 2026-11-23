import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for the space pages: the banner and the tabs, then the
 * Overview's summary cards and two columns, or (`variant="list"`, for
 * Materials and Confirm topics) two plain card rows.
 */
export function SpaceOverviewSkeleton({ variant = "overview" }: { variant?: "overview" | "list" }) {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading this Study Space.
      </p>
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-card p-6 shadow-card max-sm:p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="hidden size-14 rounded-lg sm:block" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-64 max-w-full" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-40" />
            <Skeleton className="h-11 w-32" />
            <Skeleton className="size-11" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1 border-b border-border pb-0">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="mb-px h-11 w-20 rounded-b-none sm:w-24" />
          ))}
        </div>
        {variant === "list" ? (
          <div className="mt-8 flex flex-col gap-4">
            <Skeleton className="h-8 w-48" />
            {[0, 1].map((key) => (
              <Card key={key} className="gap-4 p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 shrink-0 rounded-lg" />
                  <Skeleton className="h-6 w-3/5" />
                </div>
                <Skeleton className="h-4 w-[85%]" />
                <Skeleton className="h-4 w-2/5" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((key) => (
                <Card key={key} className="gap-3 p-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-4 w-4/5" />
                </Card>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              {[0, 1].map((key) => (
                <Card key={key} className="gap-4 p-6">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-[85%]" />
                  <Skeleton className="h-4 w-[70%]" />
                  <Skeleton className="h-11 w-36" />
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
