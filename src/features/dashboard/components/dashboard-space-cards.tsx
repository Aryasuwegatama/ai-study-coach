import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardSampleSpaces } from "../fixtures/dashboard-sample-spaces";
import type { DashboardSampleSpaceTone } from "../fixtures/dashboard-sample-types";

const TONE_CLASSES: Record<DashboardSampleSpaceTone, string> = {
  blue: "bg-secondary text-primary",
  purple: "bg-soft-purple text-purple",
  green: "bg-soft-green text-green",
};

/**
 * "My Study Spaces" grid (Figma node 80:6946, "Private Study Space
 * cards"). Reads the same `dashboard-sample-spaces.ts` fixture as the
 * sidebar, so both always show the same spaces. "Open study space" and
 * "New study space" are disabled — Study Spaces don't exist yet (T-05).
 */
export function DashboardSpaceCards() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">My Study Spaces</h2>
        <Button type="button" variant="ghost" disabled aria-disabled="true">
          New study space
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {dashboardSampleSpaces.map((space) => (
          <Card key={space.id} className="gap-4 rounded-[20px] p-6">
            <CardContent className="flex items-center gap-3 p-0">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-base font-semibold ${TONE_CLASSES[space.tone]}`}
                aria-hidden="true"
              >
                {space.name.charAt(0)}
              </span>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-foreground">{space.name}</span>
                <span className="text-xs text-muted-foreground">
                  {space.materialsCount} {space.materialsCount === 1 ? "material" : "materials"} ·{" "}
                  {space.topicsCount} topics
                </span>
              </div>
            </CardContent>
            <CardContent className="p-0">
              <p className="text-xs text-muted-foreground">
                {space.finalQuizAccuracyPercent === null
                  ? "No quizzes yet"
                  : `${space.finalQuizAccuracyPercent}% final quiz accuracy`}
              </p>
            </CardContent>
            <CardContent className="p-0">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex w-full items-center justify-between text-sm font-medium text-primary disabled:pointer-events-none disabled:opacity-60"
              >
                Open study space
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
