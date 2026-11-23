import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth/auth-session";
import { MyPlanPageClient } from "@/features/plan/components/my-plan-page-client";

export const metadata: Metadata = {
  title: "My Plan — AI Study Coach",
};

/** My Plan (T-15; replaces My Revision after lecturer feedback on 13 November 2026; redesign prototype `my-plan.html`). */
export default function MyPlanPage() {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <MyPlanContent />
      </Suspense>
    </PageContainer>
  );
}

/** The page's own session check (a layout doesn't protect its pages); the data loads in the browser from the plan routes. */
async function MyPlanContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return <MyPlanPageClient />;
}
