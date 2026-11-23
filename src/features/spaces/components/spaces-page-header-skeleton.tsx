import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for `spaces-page-header.tsx` (it reads `useSearchParams()`). */
export function SpacesPageHeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-11 w-44 shrink-0" />
    </div>
  );
}
