"use client";

import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/class-names";
import type { PracticeCard as PracticeCardData, Rating } from "../flashcards-schemas";

/** What a student may type into a short-answer card. It is shown beside the model answer and never saved or sent. */
export const MAX_TYPED_ANSWER = 2000;

const RATING_LABELS: Record<Rating, string> = { again: "Again", got_it: "Got it" };

/**
 * One practice card (Figma nodes 61:25668 front, 61:25852 answer revealed,
 * 61:26051 rating selected). The front is the card's question or prompt; a
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
    <Card className="rounded-[20px] p-6">
      <CardContent className="flex flex-col gap-5 p-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-purple px-2.5 text-xs font-semibold text-purple">
            {card.topicName}
          </span>
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            {isShort ? "Short answer" : "Recall"}
          </span>
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-purple px-2.5 text-xs font-semibold text-purple">
            AI-generated
          </span>
        </div>

        <div ref={frontRef} tabIndex={-1} className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <p className="text-xs font-semibold text-muted-foreground">{isShort ? "Question" : "Front"}</p>
          <p className="mt-1 text-lg font-medium text-foreground [overflow-wrap:anywhere]">{card.front}</p>
        </div>

        {!revealed && (
          <>
            {isShort && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="typed-answer" className="text-sm font-medium text-foreground">
                  Your answer (optional)
                </label>
                <textarea
                  id="typed-answer"
                  value={typed}
                  onChange={(event) => onTypedChange(event.target.value)}
                  maxLength={MAX_TYPED_ANSWER}
                  rows={4}
                  className="rounded-xl border border-input bg-transparent px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                />
                <p className="text-xs text-muted-foreground">Only you see this. It isn&apos;t marked or saved.</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" className="h-11 rounded-full px-6 text-base" onClick={onFlip}>
                {isShort ? "Show model answer" : "Show answer"}
              </Button>
              <span className="text-xs text-muted-foreground">or press Space</span>
            </div>
          </>
        )}

        {revealed && (
          <>
            <div ref={answerRef} tabIndex={-1} className="flex flex-col gap-4 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <div className={cn("grid gap-4", isShort && typedAnswer ? "sm:grid-cols-2" : "")}>
                {isShort && typedAnswer && (
                  <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold text-muted-foreground">Your answer</p>
                    <p className="text-sm text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">{typedAnswer}</p>
                  </div>
                )}
                <div className="flex flex-col gap-2 rounded-xl bg-soft-green/60 p-4">
                  <p className="text-xs font-semibold text-green">{isShort ? "Model answer" : "Answer"}</p>
                  <p className="text-base text-foreground [overflow-wrap:anywhere]">{card.back}</p>
                  {isShort && card.keyPoints && card.keyPoints.length > 0 && (
                    <>
                      <p className="mt-1 text-xs font-semibold text-green">Key points</p>
                      <ul className="list-disc pl-5 text-sm text-foreground">
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

              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-primary underline underline-offset-2">View source</summary>
                <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                  {card.sources.map((source) => (
                    <div key={source.chunkId}>
                      <p className="font-medium text-foreground">
                        {source.materialName} · {source.pages}
                      </p>
                      <p>{source.excerpt}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div role="group" aria-label="How did you do?" className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">How did you do?</p>
              <div className="flex flex-wrap gap-3">
                {(["again", "got_it"] as const).map((rating) => (
                  <Button
                    key={rating}
                    type="button"
                    variant={selected === rating ? "default" : "outline"}
                    aria-pressed={selected === rating}
                    className="h-11 min-w-28 rounded-full px-6 text-base"
                    onClick={() => onSelect(rating)}
                  >
                    {RATING_LABELS[rating]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Your rating is just for you. It doesn&apos;t change your mastery.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
