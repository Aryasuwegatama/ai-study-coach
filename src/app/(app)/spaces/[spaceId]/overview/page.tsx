import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { SpaceOverviewActions } from "@/features/spaces/components/space-overview-actions";
import { SpaceOverviewEmptyState } from "@/features/spaces/components/space-overview-empty-state";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";

// Static title, not the space's name: another student's URL must not
// leak a name through the tab title while `requireSpace()` resolves
// (plan step 6).
export const metadata: Metadata = {
  title: "Study Space — AI Study Coach",
};

type OverviewPageProps = { params: Promise<{ spaceId: string }> };

/** Study Space Overview (T-05; Figma node 47:17806, empty state). */
export default function SpaceOverviewPage({ params }: OverviewPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <SpaceOverviewContent params={params} />
      </Suspense>
    </div>
  );
}

/**
 * The real protection for this page (see `(app)/dashboard/page.tsx`).
 * `requireSpace()` gives the identical 404 for a missing, deleted,
 * malformed or someone-else's space ID (plan risk: "no space data
 * reaches the page").
 */
async function SpaceOverviewContent({ params }: { params: Promise<{ spaceId: string }> }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId } = await params;
  // Only `requireSpace()`'s own 404 means "not found". Anything else (for
  // example the database being unreachable) is rethrown so `(app)/error.tsx`
  // shows a "Try again" screen, rather than telling the student their
  // space doesn't exist.
  const space = await requireSpace(spaceId, user).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "SPACE_NOT_FOUND") {
      return null;
    }
    throw error;
  });
  if (!space) {
    notFound();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
            {space.name}
          </h1>
          <p className="text-sm text-muted-foreground">Personal Study Space · Private to you</p>
        </div>
        <SpaceOverviewActions spaceId={space.id} name={space.name} />
      </div>
      <SpaceOverviewTabs />
      <SpaceOverviewEmptyState name={space.name} />
    </>
  );
}
