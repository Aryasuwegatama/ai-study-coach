import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth/auth-session";
import { MyPlanPageClient } from "@/features/plan/components/my-plan-page-client";

export const metadata: Metadata = {
  title: "My Plan — AI Study Coach",
};

/** My Plan (T-15; replaces My Revision after lecturer feedback on 13 November 2026). */
export default function MyPlanPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-6 py-8 sm:px-12 sm:py-10">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-[20px]" />}>
        <MyPlanContent />
      </Suspense>
    </div>
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
