import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for `spaces-page-header.tsx` (it reads `useSearchParams()`). */
export function SpacesPageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-40 shrink-0 rounded-full" />
    </div>
  );
}
