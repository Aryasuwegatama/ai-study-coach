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
import { AttemptPageClient } from "@/features/quizzes/components/attempt-page-client";

// Static title, not the quiz's title — same reasoning as the other space pages.
export const metadata: Metadata = {
  title: "Quiz attempt — AI Study Coach",
};

type AttemptPageProps = { params: Promise<{ spaceId: string; setId: string }> };

/**
 * Take or resume a quiz attempt (T-12a; issue #46). One route covers a
 * fresh attempt, Resume and Retake — `AttemptView` asks
 * `startOrResumeAttempt` to decide which. `setId` isn't validated
 * server-side here: T-12a's quizzes live only in the example client's
 * in-browser state, so an unknown id surfaces as `AttemptView`'s own
 * "Couldn't load this quiz" state, not this page's `not-found.tsx`
 * (which only covers an invalid *space*). T-12b, with quizzes in the
 * database, can validate `setId` here too.
 */
export default function AttemptPage({ params }: AttemptPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <AttemptPageContent params={params} />
      </Suspense>
    </div>
  );
}

async function AttemptPageContent({ params }: { params: Promise<{ spaceId: string; setId: string }> }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { spaceId, setId } = await params;
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
      <AttemptPageClient spaceId={space.id} setId={setId} />
    </>
  );
}
