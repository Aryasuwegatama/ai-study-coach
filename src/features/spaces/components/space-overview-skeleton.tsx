import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for the Overview page's session + `requireSpace()` read. */
export function SpaceOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="size-8 shrink-0 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-48 w-full rounded-[20px]" />
    </div>
  );
}
