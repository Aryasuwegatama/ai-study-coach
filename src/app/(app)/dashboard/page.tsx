import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/auth-session";
import { DashboardContinueStudying } from "@/features/dashboard/components/dashboard-continue-studying";
import { DashboardLearningSnapshot } from "@/features/dashboard/components/dashboard-learning-snapshot";
import { DashboardSpaceCards } from "@/features/dashboard/components/dashboard-space-cards";
import { DashboardUpcomingRevisions } from "@/features/dashboard/components/dashboard-upcoming-revisions";
import { DashboardWelcomeHeader } from "@/features/dashboard/components/dashboard-welcome-header";
import { DashboardWelcomeHeaderSkeleton } from "./dashboard-welcome-header-skeleton";

/**
 * The Dashboard (T-04b; Figma node 80:6946). Everything but the welcome
 * name is example data from `src/features/dashboard/fixtures/` — T-05
 * and later tasks replace each section's fixture with real data without
 * touching these components (T-04b plan, "Sample data files").
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<DashboardWelcomeHeaderSkeleton />}>
        <DashboardWelcomeHeaderSection />
      </Suspense>
      <DashboardLearningSnapshot />
      <DashboardContinueStudying />
      <DashboardSpaceCards />
      <DashboardUpcomingRevisions />
      <p className="text-xs text-muted-foreground">
        Example data · illustrative, not your real progress.
      </p>
    </div>
  );
}

/**
 * The real protection for this page (see `(app)/layout.tsx`): redirects
 * a signed-out visitor rather than trusting the proxy's optimistic
 * cookie check alone.
 */
async function DashboardWelcomeHeaderSection() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const firstName = user.name.split(" ")[0] || user.name;
  return <DashboardWelcomeHeader firstName={firstName} />;
}
