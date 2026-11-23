"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MasteryStatus } from "@/features/progress/progress-schemas";
import { MasteryPill } from "./mastery-pill";

const RULES: Record<MasteryStatus, string> = {
  weak: "At least 5 questions answered and below 60%.",
  on_track: "At least 5 questions answered and 60% or above.",
  insufficient: "1 to 4 questions answered. No percentage yet.",
  not_assessed: "No quiz answers in this topic yet.",
};
const RULES_ORDER: MasteryStatus[] = ["weak", "on_track", "insufficient", "not_assessed"];

/**
 * "How is this worked out?" on both Analytics pages: the status rules and
 * what counts towards mastery, in a dialog instead of a card that takes
 * space on every visit.
 */
export function AnalyticsMethodDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Info aria-hidden="true" />
        How is this worked out?
      </DialogTrigger>
      <DialogContent className="sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>How your analytics are worked out</DialogTitle>
          <DialogDescription>
            Each topic has its own result, from your latest 10 answered quiz questions in that topic. Topics are never
            averaged together.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {RULES_ORDER.map((status) => (
            <li key={status} className="flex flex-col items-start gap-1">
              <MasteryPill status={status} />
              <span className="text-muted-foreground">{RULES[status]}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 text-muted-foreground">
          <p>The mark on each topic&apos;s bar is the 60% line.</p>
          <p>Only submitted quiz answers count towards mastery. Flashcard ratings and reviewing mistakes never change it.</p>
          <p>Your activity shows what you&apos;ve done recently. It isn&apos;t part of your mastery.</p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
