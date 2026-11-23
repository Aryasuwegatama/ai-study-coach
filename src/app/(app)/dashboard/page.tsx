import { Suspense, cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageContainer, PageHead } from "@/components/page-container";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaces } from "@/features/spaces/server";
import { getDashboardSummary } from "@/features/dashboard/server/dashboard-service";
import { DashboardContent } from "@/features/dashboard/components/dashboard-content";
import { DashboardWelcomeCard } from "@/features/dashboard/components/dashboard-welcome-card";
import { DashboardBodySkeleton } from "./dashboard-body-skeleton";
import { DashboardWelcomeCardSkeleton } from "./dashboard-welcome-card-skeleton";

type DashboardPageProps = {
  searchParams: Promise<{ from?: string }>;
};

/**
 * The Dashboard (T-04b; redesigned in the UI redesign, Step 2): page head,
 * welcome card, four summary numbers, then Study Spaces beside Continue
 * studying, Your topics are ready and Suggested for you. With no spaces it
 * is the welcome card and one empty-state card.
 */
export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return (
    <PageContainer>
      <PageHead title="Dashboard" subtitle="Your subjects, your progress, your next step." />
      <Suspense fallback={<DashboardWelcomeCardSkeleton />}>
        <DashboardWelcomeSection searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<DashboardBodySkeleton />}>
        <DashboardBody />
      </Suspense>
    </PageContainer>
  );
}

/**
 * One read of the summary per request (`cache` de-duplicates it within a
 * render), with the same session check as every other section on this page.
 */
const loadSummary = cache(async () => {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return getDashboardSummary(user);
});

async function DashboardBody() {
  return <DashboardContent summary={await loadSummary()} />;
}

/**
 * The real protection for this page (see `(app)/layout.tsx`), plus the
 * first-sign-in redirect (PRD Section 2: "After the first sign-in with
 * no spaces, the student is taken to Create Study Space"). Gated on
 * `?from=sign-in` (set by the sign-in page's `callbackURL`) rather than
 * on "zero spaces" alone, so cancelling the dialog afterwards lands on
 * this page's own empty-state prompt instead of looping back here.
 */
async function DashboardWelcomeSection({
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
  return <DashboardWelcomeCard firstName={firstName} />;
}
