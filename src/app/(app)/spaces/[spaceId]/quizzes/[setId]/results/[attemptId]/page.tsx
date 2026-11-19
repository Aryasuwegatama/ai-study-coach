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
import { ResultsPageClient } from "@/features/quizzes/components/results-page-client";

// Static title, not the quiz's title — same reasoning as the other space pages.
export const metadata: Metadata = {
  title: "Quiz results — AI Study Coach",
};

type ResultsPageProps = { params: Promise<{ spaceId: string; setId: string; attemptId: string }> };

/**
 * Quiz results and answer review (T-12a; issue #46). `setId`/`attemptId`
 * aren't validated server-side here, for the same reason as the attempt
 * route's `page.tsx`: T-12a's attempts live only in the example client's
 * in-browser state, so an unknown id surfaces inside `ResultsView`.
 */
export default function ResultsPage({ params }: ResultsPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <ResultsPageContent params={params} />
      </Suspense>
    </div>
  );
}

async function ResultsPageContent({ params }: { params: Promise<{ spaceId: string; setId: string; attemptId: string }> }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId, setId, attemptId } = await params;
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
      <SpaceOverviewTabs spaceId={space.id} active="quizzes" />
      <ResultsPageClient spaceId={space.id} setId={setId} attemptId={attemptId} />
    </>
  );
}
