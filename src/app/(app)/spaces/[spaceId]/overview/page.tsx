import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { listMaterials } from "@/features/materials/server";
import { listTopics } from "@/features/topics/server";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewEmptyState } from "@/features/spaces/components/space-overview-empty-state";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { MaterialsOverviewCard } from "@/features/materials/components/materials-overview-card";
import { ConfirmedTopicsCard } from "@/features/topics/components/confirmed-topics-card";

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

  const materials = await listMaterials(user, space.id);

  if (materials.length === 0) {
    return (
      <>
        <SpaceHeader spaceId={space.id} name={space.name} />
        <SpaceOverviewTabs spaceId={space.id} active="overview" />
        <SpaceOverviewEmptyState spaceId={space.id} name={space.name} />
      </>
    );
  }

  // Confirmed only (PRD: topic lists show confirmed topics only), split
  // by whether any material still links to them (Arya, 2026-11-18): a
  // topic whose last material was deleted stays confirmed and keeps its
  // history, so the Overview lists it under "Topics from deleted
  // materials" instead of dropping it. "Show archived" fetches archived
  // ones client-side on its own.
  const [linkedTopics, unlinkedTopics] = await Promise.all([
    listTopics(user, space.id, { materials: "linked" }),
    listTopics(user, space.id, { materials: "unlinked" }),
  ]);
  const hasMaterialAwaitingReview = materials.some((material) => material.status === "review_topics");

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="overview" />
      <div className="grid gap-6 lg:grid-cols-2">
        <MaterialsOverviewCard spaceId={space.id} materials={materials} />
        {/* `key` forces a remount when the server data changes. With
            `cacheComponents`, Activity keeps a hidden route's client
            components mounted and reuses them on return (see
            node_modules/next/dist/docs/.../cacheComponents.md, "Navigation
            with Activity"), so new props alone wouldn't refresh this
            card's `useState`-copied lists (Codex review, T-09c #44). */}
        <ConfirmedTopicsCard
          key={[...linkedTopics, ...unlinkedTopics].map((topic) => `${topic.id}:${topic.updatedAt}`).join(",")}
          spaceId={space.id}
          initialLinkedTopics={linkedTopics}
          initialUnlinkedTopics={unlinkedTopics}
          hasMaterialAwaitingReview={hasMaterialAwaitingReview}
        />
      </div>
    </>
  );
}
