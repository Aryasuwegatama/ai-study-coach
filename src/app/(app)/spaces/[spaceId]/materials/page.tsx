import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { PageContainer } from "@/components/page-container";
import { MaterialsPageClient } from "@/features/materials/components/materials-page-client";

// Static title, not the space's name — same reasoning as the Overview
// page (`overview/page.tsx`): another student's URL must not leak a
// name through the tab title while `requireSpace()` resolves.
export const metadata: Metadata = {
  title: "Materials — AI Study Coach",
};

type MaterialsPageProps = { params: Promise<{ spaceId: string }> };

/** The Materials tab: T-09a built the screens (issue #25); T-09b (issue
 * #42) connects them to the real Materials API and Blob upload. */
export default function MaterialsPage({ params }: MaterialsPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton variant="list" />}>
        <MaterialsPageContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

/**
 * This page's own protection (plan step 2: "a layout doesn't protect its
 * pages"), identical to the Overview page's — `requireSpace()` is called
 * here too, not only from the shared `SpaceHeader`/`SpaceOverviewTabs`
 * components, since neither of those reads the session.
 */
async function MaterialsPageContent({ params }: { params: Promise<{ spaceId: string }> }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId } = await params;
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
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="materials" />
      <MaterialsPageClient spaceId={space.id} />
    </>
  );
}
