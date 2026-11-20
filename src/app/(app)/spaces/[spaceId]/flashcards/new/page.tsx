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
import { DeckSetupPageClient } from "@/features/flashcards/components/deck-setup-page-client";

// Static title, not the space's name — same reasoning as the other space pages.
export const metadata: Metadata = {
  title: "Generate flashcards — AI Study Coach",
};

type DeckSetupPageProps = { params: Promise<{ spaceId: string }> };

/** The Generate Flashcards setup screen (T-18). */
export default function DeckSetupPage({ params }: DeckSetupPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpaceOverviewSkeleton />}>
        <DeckSetupPageContent params={params} />
      </Suspense>
    </div>
  );
}

async function DeckSetupPageContent({ params }: { params: Promise<{ spaceId: string }> }) {
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
      <DeckSetupPageClient spaceId={space.id} />
    </>
  );
}
