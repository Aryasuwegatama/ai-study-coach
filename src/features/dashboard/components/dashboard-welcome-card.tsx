import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The welcome card (`.welcome` in the redesign prototype): the student's own
 * first name, a calm line of copy, and two ways in. The decorative note on
 * the right is hidden on narrow screens.
 */
export function DashboardWelcomeCard({ firstName }: { firstName: string }) {
  return (
    <section
      aria-labelledby="welcome-title"
      className="flex items-center justify-between gap-6 rounded-2xl border border-border bg-[linear-gradient(110deg,var(--hero-start),var(--hero-end))] p-6 shadow-card sm:p-8"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">
          A little focus goes a long way
        </p>
        <h2 id="welcome-title" className="my-2 text-page-mobile break-words text-foreground sm:text-page">
          Welcome back, {firstName}.
        </h2>
        <p className="max-w-[42rem] text-muted-foreground">
          Pick up where you left off, or choose a subject to explore.
          <br className="hidden sm:inline" /> What you study next is up to you.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button nativeButton={false} render={<Link href="/spaces" />}>
            Open study spaces
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/plan" />}>
            View My Plan
          </Button>
        </div>
      </div>
      <div className="hidden max-w-60 flex-none basis-60 items-center gap-4 border-l border-border pl-6 min-[1150px]:flex">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <BookOpen className="size-8" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          A calm place to build understanding, one topic at a time.
        </p>
      </div>
    </section>
  );
}
