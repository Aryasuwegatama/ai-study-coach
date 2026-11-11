import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for the server component that loads `listSpaces()`. */
export function SpacesCardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[0, 1].map((key) => (
        <Card key={key} className="gap-4 rounded-[20px] p-6">
          <CardContent className="flex items-center gap-3 p-0">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </CardContent>
          <CardContent className="p-0">
            <Skeleton className="h-4 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
