import { Skeleton } from "@/components/ui/skeleton";
import { SidebarMenuItem } from "@/components/ui/sidebar";

/** Suspense fallback for `sidebar-study-spaces-nav-section.tsx`. */
export function SidebarStudySpacesNavSkeleton() {
  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <Skeleton className="h-3.5 flex-1 group-data-[collapsible=icon]:hidden" />
      </div>
    </SidebarMenuItem>
  );
}
