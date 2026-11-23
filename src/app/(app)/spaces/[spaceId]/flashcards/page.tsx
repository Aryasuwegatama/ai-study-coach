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
import { DecksPageClient } from "@/features/flashcards/components/decks-page-client";

// Static title, not the space's name — same reasoning as the
// Overview/Materials pages: another student's URL must not leak a name
// through the tab title while `requireSpace()` resolves.
export const metadata: Metadata = {
  title: "Flashcards — AI Study Coach",
};

type DecksPageProps = { params: Promise<{ spaceId: string }> };

/** The Flashcards tab: the Deck Library (T-18). */
export default function FlashcardsPage({ params }: DecksPageProps) {
  return (
    <PageContainer>
      <Suspense fallback={<SpaceOverviewSkeleton variant="list" />}>
        <DecksPageContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

/**
 * This page's own protection (plan step 2: "a layout doesn't protect its
 * pages"), identical to the Overview/Materials pages'.
 */
async function DecksPageContent({ params }: { params: Promise<{ spaceId: string }> }) {
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
      <SpaceOverviewTabs spaceId={space.id} active="flashcards" />
      <DecksPageClient spaceId={space.id} />
    </>
  );
}
