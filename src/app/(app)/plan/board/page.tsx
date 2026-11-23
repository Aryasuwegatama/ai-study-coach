import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth/auth-session";
import { PlanBoardPageClient } from "@/features/plan/components/plan-board-page-client";

export const metadata: Metadata = {
  title: "Plan board — AI Study Coach",
};

/** Plan board (UI redesign, 2026-11-23): the student's own plan as To do, Doing and Done. */
export default function PlanBoardPage() {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <PlanBoardContent />
      </Suspense>
    </PageContainer>
  );
}

/** The page's own session check (a layout doesn't protect its pages); the data loads in the browser from the plan routes. */
async function PlanBoardContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return <PlanBoardPageClient />;
}
