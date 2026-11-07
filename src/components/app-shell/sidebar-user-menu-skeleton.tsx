import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `sidebar-user-menu.tsx`, sized to roughly match
 * the real account menu button so there's no layout jump once the
 * session read resolves (same pattern as T-04a's `SignInCardSkeleton`).
 */
export function SidebarUserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2 p-2">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
