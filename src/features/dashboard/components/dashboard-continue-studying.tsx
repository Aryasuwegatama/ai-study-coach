import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardSampleContinueStudying } from "../fixtures/dashboard-sample-continue-studying";

/**
 * "Continue Studying" card (Figma node 80:6946, "Resume flashcards ·
 * HTML Fundamentals" + "Last session"). The resume button is disabled —
 * flashcard practice doesn't exist yet (T-18+ scope).
 */
export function DashboardContinueStudying() {
  const data = dashboardSampleContinueStudying;
  const progressPercent = Math.round((data.cardsCompleted / data.cardsTotal) * 100);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Continue Studying</h2>
      <Card className="flex-row items-center gap-6 rounded-[20px] p-6">
        <CardContent className="flex flex-1 flex-col gap-2 p-0">
          <p className="text-base font-semibold text-foreground">{data.spaceName}</p>
          <p className="text-sm text-muted-foreground">
            {data.deckStyleLabel} / {data.deckTopicLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.cardsCompleted} of {data.cardsTotal} cards reviewed · {data.practiceModeLabel}
          </p>
          <Button type="button" disabled aria-disabled="true" className="mt-2 w-fit rounded-full">
            Resume flashcards
          </Button>
        </CardContent>
        <CardContent className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl bg-secondary p-5">
          <span className="text-xs font-semibold text-primary">YOUR LAST SESSION</span>
          <span className="text-base font-semibold text-foreground">{data.lastSessionTitle}</span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {data.cardsCompleted} / {data.cardsTotal} reviewed
          </span>
        </CardContent>
      </Card>
    </section>
  );
}
