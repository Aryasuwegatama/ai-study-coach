import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth/auth-session";
import { getAllProgress } from "@/features/progress/server";
import { MyAnalyticsView } from "@/features/analytics/components/my-analytics-view";

export const metadata: Metadata = {
  title: "Analytics — AI Study Coach",
};

/** My Analytics (T-15; Figma 65:43262 and 65:43516): mastery across all Study Spaces. */
export default function MyAnalyticsPage() {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<MyAnalyticsSkeleton />}>
        <MyAnalyticsContent />
      </Suspense>
    </div>
  );
}

function MyAnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-56 w-full rounded-[20px]" />
        ))}
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
