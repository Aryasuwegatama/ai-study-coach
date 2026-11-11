import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaces } from "@/features/spaces/server";
import { SpacesCardGrid } from "@/features/spaces/components/spaces-card-grid";
import { SpacesCardGridSkeleton } from "@/features/spaces/components/spaces-card-grid-skeleton";
import { DashboardContinueStudying } from "@/features/dashboard/components/dashboard-continue-studying";
import { DashboardLearningSnapshot } from "@/features/dashboard/components/dashboard-learning-snapshot";
import { DashboardUpcomingRevisions } from "@/features/dashboard/components/dashboard-upcoming-revisions";
import { DashboardWelcomeHeader } from "@/features/dashboard/components/dashboard-welcome-header";
import { DashboardWelcomeHeaderSkeleton } from "./dashboard-welcome-header-skeleton";

type DashboardPageProps = {
  searchParams: Promise<{ from?: string }>;
};

/**
 * The Dashboard (T-04b; Figma node 80:6946). T-05 replaces the
 * "My Study Spaces" fixture with the student's real spaces; Learning
 * Snapshot, Continue Studying and Upcoming Revisions are still example
 * data until their own tasks (T-14/T-15) land.
 */
export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<DashboardWelcomeHeaderSkeleton />}>
        <DashboardWelcomeHeaderSection searchParams={searchParams} />
      </Suspense>
      <DashboardLearningSnapshot />
      <DashboardContinueStudying />
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">My Study Spaces</h2>
          <Button
            variant="ghost"
            className="gap-2"
            nativeButton={false}
            render={<Link href="/spaces?create=1" />}
          >
            <Plus className="size-4" aria-hidden="true" />
            New study space
          </Button>
        </div>
        <Suspense fallback={<SpacesCardGridSkeleton />}>
          <DashboardSpacesSection />
        </Suspense>
      </section>
      <DashboardUpcomingRevisions />
      <p className="text-xs text-muted-foreground">
        Example data: Learning Snapshot, Continue Studying and Upcoming Revisions are
        illustrative, not your real progress.
      </p>
    </div>
  );
}

/**
 * The real protection for this page (see `(app)/layout.tsx`), plus the
 * first-sign-in redirect (PRD Section 2: "After the first sign-in with
 * no spaces, the student is taken to Create Study Space"). Gated on
 * `?from=sign-in` (set by the sign-in page's `callbackURL`) rather than
 * on "zero spaces" alone, so cancelling the dialog afterwards lands on
 * this page's own empty-state prompt instead of looping back here.
 */
async function DashboardWelcomeHeaderSection({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await connection();
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) {
    redirect("/sign-in");
  }

  if (params.from === "sign-in") {
    const spaces = await listSpaces(user);
    if (spaces.length === 0) {
      redirect("/spaces?create=1");
    }
  }

  const firstName = user.name.split(" ")[0] || user.name;
  return <DashboardWelcomeHeader firstName={firstName} />;
}

async function DashboardSpacesSection() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const spaces = await listSpaces(user);
  return <SpacesCardGrid spaces={spaces} />;
}
