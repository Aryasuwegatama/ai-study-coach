import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { getSpaceProgress } from "@/features/progress/server";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { SpaceAnalyticsView, type AnalyticsView } from "@/features/analytics/components/space-analytics-view";

// Static title, not the space's name: another student's URL must not leak a
// name through the tab title while `requireSpace()` resolves.
export const metadata: Metadata = {
  title: "Analytics — AI Study Coach",
};

type SpaceAnalyticsPageProps = {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ view?: string }>;
};

/** The Analytics tab (T-15; Figma 65:43673, weak view 65:44105). */
export default function SpaceAnalyticsPage({ params, searchParams }: SpaceAnalyticsPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <SpaceAnalyticsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * This page's own protection, identical to the Overview's: session check,
 * then `requireSpace()`'s 404 for a missing, deleted, malformed or someone
 * else's space. Read-only, so it calls the Progress service directly.
 */
async function SpaceAnalyticsContent({ params, searchParams }: SpaceAnalyticsPageProps) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [{ spaceId }, query] = await Promise.all([params, searchParams]);
  const space = await requireSpace(spaceId, user).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "SPACE_NOT_FOUND") {
      return null;
    }
    throw error;
  });
  if (!space) {
    notFound();
  }

  const progress = await getSpaceProgress(user, space.id);
  const view: AnalyticsView = query.view === "weak" ? "weak" : "all";

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="analytics" />
      <SpaceAnalyticsView progress={progress} view={view} />
    </>
  );
}
