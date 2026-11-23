import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { requireMaterial, toMaterialResponse } from "@/features/materials/server";
import { getTopicDraft, listTopics } from "@/features/topics/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { TopicReviewEditor } from "@/features/topics/components/topic-review-editor";

// Static title, not the material's name — same reasoning as the
// Materials/Overview pages: another student's URL must not leak details
// through the tab title while `requireSpace()`/`requireMaterial()` resolve.
export const metadata: Metadata = {
  title: "Confirm topics — AI Study Coach",
};

type TopicsPageProps = { params: Promise<{ spaceId: string; materialId: string }> };

/** The Confirm topics page (T-09c; redesigned in the UI redesign, Step 5). */
export default function TopicsReviewPage({ params }: TopicsPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton variant="list" />}>
        <TopicsReviewContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function TopicsReviewContent({ params }: { params: Promise<{ spaceId: string; materialId: string }> }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId, materialId } = await params;
  const space = await requireSpace(spaceId, user).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "SPACE_NOT_FOUND") return null;
    throw error;
  });
  if (!space) {
    notFound();
  }

  const material = await requireMaterial(materialId, user).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "MATERIAL_NOT_FOUND") return null;
    throw error;
  });
  // The material's own space must match the URL's space, or another
  // student's (or this student's own, wrong-space) material ID would
  // resolve under a mismatched Study Space breadcrumb.
  if (!material || material.spaceId !== space.id) {
    notFound();
  }

  const materialsHref = `/spaces/${space.id}/materials`;

  if (material.status !== "review_topics") {
    const message =
      material.status === "ready"
        ? "Topics for this material are already confirmed."
        : "Topics aren't ready to confirm yet.";
    return (
      <>
        <SpaceHeader spaceId={space.id} name={space.name} />
        <SpaceOverviewTabs spaceId={space.id} active="materials" />
        <Card className="mt-8 items-start gap-4 p-6 max-sm:p-4">
          <h2 className="text-card-title text-foreground">Confirm topics</h2>
          <p className="text-muted-foreground">{message}</p>
          <Button variant="outline" nativeButton={false} render={<Link href={materialsHref} />}>
            Return to Materials
          </Button>
        </Card>
      </>
    );
  }

  // All confirmed topics, linked or not — confirming links to an
  // existing topic by name either way (T-09c, Arya 2026-11-18).
  const [draft, confirmedTopics] = await Promise.all([
    getTopicDraft(user, material.id),
    listTopics(user, space.id),
  ]);

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="materials" />
      {/* `key` forces a remount when the server data changes. With
          `cacheComponents`, Activity keeps a hidden route's client
          components mounted and reuses them on return (see
          node_modules/next/dist/docs/.../cacheComponents.md, "Navigation
          with Activity"), so new props alone wouldn't refresh this
          editor's `useState`-copied draft (Codex review, T-09c #44). */}
      <TopicReviewEditor
        key={[material.id, ...draft.topics.map((topic) => `${topic.id}:${topic.name}`)].join(",")}
        spaceId={space.id}
        materialId={material.id}
        material={toMaterialResponse(material)}
        initialDraft={draft}
        confirmedTopicNames={confirmedTopics.map((topic) => topic.name)}
      />
    </>
  );
}
