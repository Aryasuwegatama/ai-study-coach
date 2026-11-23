import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/server/auth/auth-session";
import { getAllProgress } from "@/features/progress/server";
import { MyAnalyticsView } from "@/features/analytics/components/my-analytics-view";

export const metadata: Metadata = {
  title: "Analytics — AI Study Coach",
};

/** Analytics (T-15; redesign prototype `analytics.html`): mastery across all Study Spaces. */
export default function MyAnalyticsPage() {
  return (
    <PageContainer>
      <Suspense fallback={<MyAnalyticsSkeleton />}>
        <MyAnalyticsContent />
      </Suspense>
    </PageContainer>
  );
}

function MyAnalyticsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading your analytics.
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-[32rem] max-w-full" />
        </div>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
          <div className="flex flex-col gap-4">
            {[0, 1].map((key) => (
              <Card key={key} className="gap-4 p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 shrink-0 rounded-lg" />
                  <Skeleton className="h-6 w-3/5" />
                </div>
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-11 w-36" />
              </Card>
            ))}
          </div>
          <Card className="gap-4 p-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[70%]" />
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The page's own protection (a layout doesn't protect its pages): session
 * check, then only this student's spaces, read-only through the Progress service.
 */
async function MyAnalyticsContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  return <MyAnalyticsView spaces={await getAllProgress(user)} />;
}
