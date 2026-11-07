import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for the sign-in card, sized to roughly match the real
 * card (Figma node 98:8440) so there's no layout jump once the session
 * read resolves.
 */
export function SignInCardSkeleton() {
  return (
    <Card className="w-full max-w-[480px] rounded-[20px] p-6 sm:p-12">
      <CardContent className="flex flex-col items-center gap-4 px-0">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 h-11 w-full rounded-full" />
      </CardContent>
    </Card>
  );
}
