import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaces } from "@/features/spaces/server";
import { SpacesCardGrid } from "@/features/spaces/components/spaces-card-grid";
import { SpacesCardGridSkeleton } from "@/features/spaces/components/spaces-card-grid-skeleton";
import { SpacesPageHeader } from "@/features/spaces/components/spaces-page-header";
import { SpacesPageHeaderSkeleton } from "@/features/spaces/components/spaces-page-header-skeleton";

export const metadata: Metadata = {
  title: "My Study Spaces — AI Study Coach",
};

/**
 * "My Study Spaces" (T-05; Figma node 37:2896). Title/button and grid sit
 * behind their own `<Suspense>` boundaries: the header reads
 * `useSearchParams()` (for `?create=1`), the grid reads the session and
 * the student's real spaces.
 */
export default function SpacesPage() {
  return (
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<SpacesPageHeaderSkeleton />}>
        <SpacesPageHeader />
      </Suspense>
      <Suspense fallback={<SpacesCardGridSkeleton />}>
        <SpacesCardGridSection />
      </Suspense>
    </div>
  );
}

/**
 * The real protection for this page — see `(app)/dashboard/page.tsx`.
 * `connection()` makes the request-time nature explicit: this always
 * reads the live, per-student list, and should never be prerendered or
 * shared across visitors (Next.js docs: "connection", "io").
 */
async function SpacesCardGridSection() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const spaces = await listSpaces(user);
  return <SpacesCardGrid spaces={spaces} />;
}
