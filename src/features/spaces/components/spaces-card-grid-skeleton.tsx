import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for the Study Space cards: three card skeletons in the same grid. */
export function SpacesCardGridSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  return (
    <div
      className={layout === "grid" ? "grid grid-cols-1 gap-6 sm:grid-cols-2" : "flex flex-col gap-4"}
      aria-busy="true"
    >
      <p className="sr-only" role="status">
        Loading your Study Spaces.
      </p>
      {[0, 1, 2].map((key) => (
        <Card key={key} className="gap-4 p-6" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <Skeleton className="h-6 w-3/5" />
          </div>
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-11 w-32 max-w-full" />
        </Card>
      ))}
    </div>
  );
}
