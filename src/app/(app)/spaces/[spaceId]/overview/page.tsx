import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { PageContainer } from "@/components/page-container";
import { listMaterials } from "@/features/materials/server";
import { getUnfinishedDecks, getUnfinishedQuizzes } from "@/features/plan/server";
import { getSpaceProgress } from "@/features/progress/server";
import { listSets } from "@/features/quizzes/server";
import { listTopics } from "@/features/topics/server";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewEmptyState } from "@/features/spaces/components/space-overview-empty-state";
import { SpaceOverviewMetrics } from "@/features/spaces/components/space-overview-metrics";
import { SpaceOverviewMistakes } from "@/features/spaces/components/space-overview-mistakes";
import { SpaceOverviewNotice } from "@/features/spaces/components/space-overview-notice";
import { SpaceOverviewResume } from "@/features/spaces/components/space-overview-resume";
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

/** Study Space Overview (T-05; redesigned in the UI redesign, Step 3). */
export default function SpaceOverviewPage({ params }: OverviewPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <SpaceOverviewContent params={params} />
      </Suspense>
    </PageContainer>
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

  // The empty state only shows for a space with no materials AND no
  // topics of any status (T-12b, Codex finding on #45): deleting a
  // space's last material keeps every topic that has quiz history, and
  // those still deserve the normal layout, not the "start from
  // scratch" screen. `includeArchived` catches a topic that was archived
  // after its last material was gone.
  if (materials.length === 0) {
    const anyTopics = await listTopics(user, space.id, { includeArchived: true });
    if (anyTopics.length === 0) {
      return (
        <>
          <SpaceHeader spaceId={space.id} name={space.name} actions="overview" />
          <SpaceOverviewTabs spaceId={space.id} active="overview" />
          <div className="mt-6">
            <SpaceOverviewEmptyState spaceId={space.id} />
          </div>
        </>
      );
    }
  }

  // Confirmed only (PRD: topic lists show confirmed topics only), split
  // by whether any material still links to them (Arya, 2026-11-18): a
  // topic whose last material was deleted stays confirmed and keeps its
  // history, so the Overview lists it under "Topics from deleted
  // materials" instead of dropping it. Archived topics are fetched
  // client-side by the topics card on its own.
  const [linkedTopics, unlinkedTopics, progress, sets, unfinishedQuizzes, unfinishedDecks] = await Promise.all([
    listTopics(user, space.id, { materials: "linked" }),
    listTopics(user, space.id, { materials: "unlinked" }),
    getSpaceProgress(user, space.id),
    listSets(user, space.id, null),
    getUnfinishedQuizzes(user),
    getUnfinishedDecks(user),
  ]);
  const hasMaterialAwaitingReview = materials.some((material) => material.status === "review_topics");
  const progressByTopic = Object.fromEntries(progress.topics.map((topic) => [topic.topicId, topic]));
  const mistakes = progress.topics.reduce((sum, topic) => sum + topic.mistakes, 0);

  // The most recently touched unfinished quiz or deck in this space (same
  // tie-break as the Dashboard: both lists are already newest-first).
  const resume =
    [unfinishedQuizzes.find((quiz) => quiz.spaceId === space.id), unfinishedDecks.find((deck) => deck.spaceId === space.id)]
      .filter((entry) => entry !== undefined)
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0] ?? null;

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} actions="overview" />
      <SpaceOverviewTabs spaceId={space.id} active="overview" />
      <div className="mt-6 flex flex-col gap-6">
        <SpaceOverviewNotice spaceId={space.id} materials={materials} />
        <SpaceOverviewMetrics spaceId={space.id} materials={materials} topics={progress.topics} sets={sets} />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <StickyEndColumn className="flex flex-col gap-6">
            <SpaceOverviewResume spaceId={space.id} resume={resume} />
            <MaterialsOverviewCard spaceId={space.id} materials={materials} />
            <SpaceOverviewMistakes spaceId={space.id} mistakes={mistakes} />
          </StickyEndColumn>
          {/* `key` forces a remount when the server data changes. With
              `cacheComponents`, Activity keeps a hidden route's client
              components mounted and reuses them on return (see
              node_modules/next/dist/docs/.../cacheComponents.md, "Navigation
              with Activity"), so new props alone wouldn't refresh this
              card's `useState`-copied lists (Codex review, T-09c #44). */}
          <StickyEndColumn>
            <ConfirmedTopicsCard
              key={[...linkedTopics, ...unlinkedTopics].map((topic) => `${topic.id}:${topic.updatedAt}`).join(",")}
              spaceId={space.id}
              initialLinkedTopics={linkedTopics}
              initialUnlinkedTopics={unlinkedTopics}
              progressByTopic={progressByTopic}
              hasMaterialAwaitingReview={hasMaterialAwaitingReview}
            />
          </StickyEndColumn>
        </div>
      </div>
    </>
  );
}
