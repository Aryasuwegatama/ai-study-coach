import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CountChip } from "@/components/count-chip";
import { SpacesCardGrid } from "@/features/spaces/components/spaces-card-grid";
import { SpacesEmptyState } from "@/features/spaces/components/spaces-empty-state";
import type { DashboardSummary } from "../server/dashboard-service";
import { DashboardLearningSnapshot } from "./dashboard-learning-snapshot";
import { DashboardResume } from "./dashboard-resume";
import { DashboardSuggestedForYou } from "./dashboard-suggested-for-you";
import { DashboardTopicsReady } from "./dashboard-topics-ready";

/**
 * Everything on the Dashboard under the welcome card. With no spaces it is
 * one empty-state card (the numbers and the side column are hidden);
 * otherwise the four numbers, then Study Spaces beside Continue studying,
 * Your topics are ready and Suggested for you.
 */
export function DashboardContent({ summary }: { summary: DashboardSummary }) {
  if (summary.spaces.length === 0) {
    return (
      <div className="mt-6">
        <SpacesEmptyState
          title="Your study starts with a space"
          body="Create a Study Space for one subject. Then upload your notes and confirm the topics you want to study."
        />
      </div>
    );
  }

  return (
    <>
      <DashboardLearningSnapshot summary={summary} />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,1fr)]">
        <section aria-labelledby="spaces-title">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="spaces-title" className="flex items-center gap-2 text-section text-foreground">
              Your Study Spaces <CountChip count={summary.spaces.length} />
            </h2>
            <Button variant="ghost" nativeButton={false} render={<Link href="/spaces" />}>
              View all
            </Button>
          </header>
          <SpacesCardGrid spaces={summary.spaces} layout="list" />
          <p className="mt-4 text-sm text-muted-foreground">
            Mastery comes from scored quizzes. Flashcards help you practise without changing it.
          </p>
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardResume resume={summary.resume} />
          <DashboardTopicsReady topicsReady={summary.topicsReady} />
          <DashboardSuggestedForYou suggestions={summary.suggestions} />
        </div>
      </div>
    </>
  );
}
