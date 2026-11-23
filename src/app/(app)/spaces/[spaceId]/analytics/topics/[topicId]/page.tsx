import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { safeTimeZone } from "@/lib/time-zone";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { getTopicMastery } from "@/features/progress/server";
import { PageContainer } from "@/components/page-container";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { TopicDetailView } from "@/features/analytics/components/topic-detail-view";

export const metadata: Metadata = {
  title: "Topic analytics — AI Study Coach",
};

type TopicAnalyticsPageProps = { params: Promise<{ spaceId: string; topicId: string }> };

/** Topic detail (T-15; redesign prototype `topic-detail.html`). */
export default function TopicAnalyticsPage({ params }: TopicAnalyticsPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton variant="list" />}>
        <TopicAnalyticsContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

const isNotFound = (error: unknown, code: string) => error instanceof ApiError && error.code === code;

/**
 * A topic that isn't the student's, or isn't in the space named in the URL,
 * is "not found": both ids are checked on the server before anything renders.
 */
async function TopicAnalyticsContent({ params }: TopicAnalyticsPageProps) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId, topicId } = await params;
  const space = await requireSpace(spaceId, user).catch((error: unknown) => {
    if (isNotFound(error, "SPACE_NOT_FOUND")) return null;
    throw error;
  });
  if (!space) {
    notFound();
  }
  const detail = await getTopicMastery(user, topicId).catch((error: unknown) => {
    if (isNotFound(error, "TOPIC_NOT_FOUND")) return null;
    throw error;
  });
  if (!detail || detail.spaceId !== space.id) {
    notFound();
  }

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="analytics" />
      <TopicDetailView detail={detail} timeZone={safeTimeZone(user.timeZone)} />
    </>
  );
}
