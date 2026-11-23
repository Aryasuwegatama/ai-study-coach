import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/server/auth/auth-session";
import { requireSpace } from "@/server/auth/auth-space-access";
import { PageContainer } from "@/components/page-container";
import { SpaceHeader } from "@/features/spaces/components/space-header";
import { SpaceOverviewSkeleton } from "@/features/spaces/components/space-overview-skeleton";
import { SpaceOverviewTabs } from "@/features/spaces/components/space-overview-tabs";
import { requireSet } from "@/features/quizzes/server";
import { PracticePageClient } from "@/features/flashcards/components/practice-page-client";

// Static title, not the deck's title: another student's URL must not leak a name through the tab title.
export const metadata: Metadata = {
  title: "Flashcard practice — AI Study Coach",
};

type PracticePageProps = { params: Promise<{ spaceId: string; setId: string }> };

/**
 * Practise or resume a flashcard deck (T-18). One route covers a first
 * practice, Resume and Practise again: `PracticeView` asks
 * `startOrResumePractice` to decide which.
 */
export default function PracticePage({ params }: PracticePageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton variant="list" />}>
        <PracticePageContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

/**
 * This page's own protection: signed in, the space is the student's, and the
 * deck is the student's deck in that space (a quiz id, someone else's deck or
 * a deck from another space is "not found", never a hint).
 */
async function PracticePageContent({ params }: { params: Promise<{ spaceId: string; setId: string }> }) {
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
  const set = await requireSet(setId, user).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "SET_NOT_FOUND") {
      return null;
    }
    throw error;
  });
  if (!set || set.kind !== "deck" || set.spaceId !== space.id) {
    notFound();
  }

  return (
    <>
      <SpaceHeader spaceId={space.id} name={space.name} />
      <SpaceOverviewTabs spaceId={space.id} active="flashcards" />
      <PracticePageClient spaceId={space.id} setId={set.id} />
    </>
  );
}
