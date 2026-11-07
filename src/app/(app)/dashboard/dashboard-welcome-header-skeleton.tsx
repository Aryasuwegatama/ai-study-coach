import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for the welcome header, sized to roughly match the
 * real heading so there's no layout jump once the session read resolves
 * (same pattern as T-04a's `SignInCardSkeleton`).
 */
export function DashboardWelcomeHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
  );
}
