"use client";

import type { Ref } from "react";
import { Check, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/class-names";
import type { PracticeCard as PracticeCardData, Rating } from "../flashcards-schemas";

/** What a student may type into a short-answer card. It is shown beside the model answer and never saved or sent. */
export const MAX_TYPED_ANSWER = 2000;

const RATING_LABELS: Record<Rating, string> = { again: "Again", got_it: "Got it" };

/**
 * One practice card (T-18; UI redesign 2026-11-23, matching the quiz question
 * card). The front is the card's question or prompt; a
 * short-answer card also has a typing box. Flipping shows the back (recall) or
 * the model answer with its key points (short answer, with what the student
 * typed beside it, never marked). After flipping, the student picks Again or
 * Got it; the parent's Next button saves it.
 *
 * Focus: `frontRef` is focused when a card appears and `answerRef` after
 * flipping (the parent does both). Space flips the card (the parent listens);
 * in the typing box a space is just a space.
 */
export function PracticeCardView({
  card,
  revealed,
  typed,
  onTypedChange,
  onFlip,
  selected,
  onSelect,
  frontRef,
  answerRef,
}: {
  card: PracticeCardData;
  revealed: boolean;
  typed: string;
  onTypedChange: (value: string) => void;
  onFlip: () => void;
  selected: Rating | null;
  onSelect: (rating: Rating) => void;
  frontRef: Ref<HTMLDivElement>;
  answerRef: Ref<HTMLDivElement>;
}) {
  const isShort = card.kind === "short_answer";
  const typedAnswer = typed.trim();

  return (
    <Card className="gap-5 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="purple">{card.topicName}</Badge>
        <Badge tone="neutral">{isShort ? "Short answer" : "Recall"}</Badge>
        <Badge tone="neutral">
          <Sparkles aria-hidden="true" />
          AI-generated
        </Badge>
      </div>

      <div ref={frontRef} tabIndex={-1} className="-m-2 rounded-lg p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">{isShort ? "Question" : "Front"}</p>
        <p className="mt-1 text-card-title text-foreground [overflow-wrap:anywhere]">{card.front}</p>
      </div>

      {!revealed && (
        <>
          {isShort && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="typed-answer" className="text-sm font-semibold text-foreground">
                Your answer (optional)
              </label>
              <textarea
                id="typed-answer"
                value={typed}
                onChange={(event) => onTypedChange(event.target.value)}
                maxLength={MAX_TYPED_ANSWER}
                rows={4}
                aria-describedby="typed-answer-help"
                className="rounded-sm border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
              <p id="typed-answer-help" className="text-sm text-muted-foreground">
                Only you see this. It isn&apos;t marked or saved.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onFlip}>
              {isShort ? "Show model answer" : "Show answer"}
            </Button>
            <span className="text-sm text-muted-foreground">or press Space</span>
          </div>
        </>
      )}

      {revealed && (
        <>
          <div ref={answerRef} tabIndex={-1} className="-m-2 flex flex-col gap-4 rounded-lg p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <div className={cn("grid gap-4", isShort && typedAnswer ? "md:grid-cols-2" : "")}>
              {isShort && typedAnswer && (
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-muted-foreground">Your answer</p>
                  <p className="text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">{typedAnswer}</p>
                </div>
              )}
              <div className="flex flex-col gap-2 rounded-lg border border-green bg-soft-green p-4">
                <p className="text-sm font-semibold text-green">{isShort ? "Model answer" : "Answer"}</p>
                <p className="text-foreground [overflow-wrap:anywhere]">{card.back}</p>
                {isShort && card.keyPoints && card.keyPoints.length > 0 && (
                  <>
                    <p className="mt-1 text-sm font-semibold text-green">Key points</p>
                    <ul className="list-disc pl-5 text-foreground">
                      {card.keyPoints.map((point) => (
                        <li key={point} className="[overflow-wrap:anywhere]">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                View source
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm">
                {card.sources.map((source) => (
                  <div key={source.chunkId}>
                    <p className="font-semibold break-words text-foreground">
                      {source.materialName} · {source.pages}
                    </p>
                    <p className="mt-1 text-muted-foreground">{source.excerpt}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div role="group" aria-labelledby="rating-label" className="flex flex-col gap-2 border-t border-border pt-4">
            <p id="rating-label" className="text-sm font-semibold text-foreground">
              How did you do?
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["again", "got_it"] as const).map((rating) => {
                const picked = selected === rating;
                const Icon = rating === "again" ? RotateCcw : Check;
                return (
                  <button
                    key={rating}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => onSelect(rating)}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-left font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      picked ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]" : "border-input bg-card hover:bg-surface-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border",
                        picked ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="flex-1">{RATING_LABELS[rating]}</span>
                    {picked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
