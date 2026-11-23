import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for the welcome card, sized to roughly match the real
 * card so there's no layout jump once the session read resolves (same
 * pattern as T-04a's `SignInCardSkeleton`).
 */
export function DashboardWelcomeCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8"
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-52" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-5 w-[28rem] max-w-full" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-11 w-44" />
        <Skeleton className="h-11 w-36" />
      </div>
    </div>
  );
}
