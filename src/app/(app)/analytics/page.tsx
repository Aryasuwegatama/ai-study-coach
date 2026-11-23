import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/server/auth/auth-session";
import { getActivity, getAllProgress } from "@/features/progress/server";
import { safeTimeZone } from "@/lib/time-zone";
import { MyAnalyticsView } from "@/features/analytics/components/my-analytics-view";
import { parseAnalyticsView } from "@/features/analytics/analytics-format";

type MyAnalyticsPageProps = { searchParams: Promise<{ view?: string }> };

export const metadata: Metadata = {
  title: "Analytics — AI Study Coach",
};

/** Analytics (T-15; redesign prototype `analytics.html`): mastery across all Study Spaces. */
export default function MyAnalyticsPage({ searchParams }: MyAnalyticsPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<MyAnalyticsSkeleton />}>
        <MyAnalyticsContent searchParams={searchParams} />
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
          <Card className="gap-5 p-6">
            <Skeleton className="h-6 w-1/3" />
            {[0, 1, 2].map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </Card>
          <Card className="gap-4 p-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-36 w-full" />
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
async function MyAnalyticsContent({ searchParams }: MyAnalyticsPageProps) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [spaces, activity, query] = await Promise.all([getAllProgress(user), getActivity(user, null), searchParams]);
  return (
    <MyAnalyticsView
      spaces={spaces}
      activity={activity}
      timeZone={safeTimeZone(user.timeZone)}
      view={parseAnalyticsView(query.view)}
    />
  );
}
