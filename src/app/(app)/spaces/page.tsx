import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaceSummaries } from "@/features/spaces/server";
import { SpacesCardGrid } from "@/features/spaces/components/spaces-card-grid";
import { SpacesCardGridSkeleton } from "@/features/spaces/components/spaces-card-grid-skeleton";
import { SpacesEmptyState } from "@/features/spaces/components/spaces-empty-state";
import { SpacesPageHeader } from "@/features/spaces/components/spaces-page-header";
import { SpacesPageHeaderSkeleton } from "@/features/spaces/components/spaces-page-header-skeleton";

export const metadata: Metadata = {
  title: "Study Spaces — AI Study Coach",
};

/**
 * Study Spaces (T-05; redesigned in the UI redesign, Step 2). The data read
 * sits behind one `<Suspense>` boundary; inside it, the header has its own
 * boundary because it reads `useSearchParams()` (for `?create=1`).
 */
export default function SpacesPage() {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <>
            <SpacesPageHeaderSkeleton />
            <SpacesCardGridSkeleton />
          </>
        }
      >
        <SpacesPageContent />
      </Suspense>
    </PageContainer>
  );
}

/**
 * The real protection for this page — see `(app)/dashboard/page.tsx`.
 * `connection()` makes the request-time nature explicit: this always
 * reads the live, per-student list, and should never be prerendered or
 * shared across visitors (Next.js docs: "connection", "io").
 */
async function SpacesPageContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const spaces = await listSpaceSummaries(user);
  return (
    <>
      <Suspense fallback={<SpacesPageHeaderSkeleton />}>
        <SpacesPageHeader count={spaces.length} />
      </Suspense>
      {spaces.length === 0 ? (
        <SpacesEmptyState
          title="Give your first subject a space"
          body="Create a Study Space to keep your notes, topics, quizzes and flashcards together."
        />
      ) : (
        <>
          <SpacesCardGrid spaces={spaces} />
          <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Only you can access your spaces and the materials you upload.</span>
          </p>
        </>
      )}
    </>
  );
}
