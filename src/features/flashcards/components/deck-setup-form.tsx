"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { cn } from "@/lib/class-names";
import {
  CARD_COUNT_MAX,
  CARD_COUNT_MIN,
  CARD_STYLES,
  SET_TITLE_MAX,
  TOO_MANY_TOPICS_DECK_MESSAGE,
  type CardStyle,
  type CreateDeckRequest,
  type SetResponse,
} from "@/features/quizzes/quizzes-schemas";
import { SetupMaterialList, SetupPickerStatus, useSetupPicker } from "@/features/quizzes/components/setup-picker";
import { FlashcardsClientError, type FlashcardsClient } from "../client/flashcards-client";
import { CARD_STYLE_LABELS, cardCountLabel } from "../flashcards-format";

const STYLE_HINTS: Record<CardStyle, string> = {
  recall: "A short prompt on the front, a short answer on the back.",
  short_answer: "A question you answer by typing, then a model answer with key points.",
  mix: "Half recall cards and half short-answer cards.",
};

const COUNT_ERROR = `Choose between ${CARD_COUNT_MIN} and ${CARD_COUNT_MAX} cards.`;

function isCardStyle(value: string | null): value is CardStyle {
  return (CARD_STYLES as readonly string[]).includes(value ?? "");
}

/**
 * The Create flashcards setup screen (T-18; UI redesign 2026-11-23, the same
 * layout as Create quiz): materials and topics on the left; the deck's name,
 * card style, card count and the Create button on the right. The materials-and-topics picker
 * is the quiz setup's (`setup-picker.tsx`). `?topic=<topicId>` ticks only that
 * topic; `?retry=<setId>` prefills the same materials, topics, style and count
 * as that deck (the failed card's "Try again").
 */
export function DeckSetupForm({ spaceId, client }: { spaceId: string; client: FlashcardsClient }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");
  const retryParam = searchParams.get("retry");

  const [cardStyle, setCardStyle] = useState<CardStyle>("recall");
  // Kept as text so the field can be emptied while typing; validated below.
  const [countText, setCountText] = useState("10");
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const restoreFromRetry = useCallback((set: SetResponse) => {
    if (isCardStyle(set.cardStyle)) setCardStyle(set.cardStyle);
    setCountText(String(set.requestedCount));
  }, []);
  const picker = useSetupPicker({ spaceId, topicParam, retryParam, client, onRetryLoaded: restoreFromRetry });

  // Next 16 keeps this page alive, hidden, after "Create flashcards"
  // navigates to the library, so coming back would show a stuck "Creating…"
  // button. Reset the submit state when it's hidden.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setSubmitError(null);
      setName("");
    };
  }, []);

  const parsedCount = countText.trim() === "" ? NaN : Number(countText);
  const countValid = Number.isInteger(parsedCount) && parsedCount >= CARD_COUNT_MIN && parsedCount <= CARD_COUNT_MAX;
  const selectedTopicCount = picker.selectedTopicIds.length;
  const tooManyTopics = countValid && selectedTopicCount > parsedCount;
  const canGenerate = picker.selectedMaterialIds.length > 0 && selectedTopicCount > 0 && countValid && !tooManyTopics && !submitting;

  const nothingSelected = selectedTopicCount === 0;
  const previewLine =
    countValid && selectedTopicCount > 0 && !tooManyTopics
      ? `${cardCountLabel(parsedCount)} across ${selectedTopicCount} topic${selectedTopicCount === 1 ? "" : "s"}`
      : null;
  const libraryHref = `/spaces/${spaceId}/flashcards`;

  async function handleGenerate() {
    if (!canGenerate) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const request: CreateDeckRequest = {
        kind: "deck",
        materialIds: picker.selectedMaterialIds,
        topicIds: picker.selectedTopicIds,
        cardStyle,
        count: parsedCount,
        // Blank: the server names it "Deck N". Its topics show as tags, not in the name.
        ...(name.trim() ? { title: name.trim() } : {}),
      };
      await client.createDeck(request);
      router.push(`/spaces/${spaceId}/flashcards`);
    } catch (err) {
      setSubmitError(err instanceof FlashcardsClientError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const head = (
    <header>
      <h2 className="text-section text-foreground">Create flashcards</h2>
      <p className="mt-1 max-w-[42rem] text-muted-foreground">Choose your materials, confirmed topics, card style and number of cards.</p>
    </header>
  );

  if (picker.state !== "ready") {
    return (
      <section className="mt-6 flex flex-col gap-6">
        {head}
        <SetupPickerStatus picker={picker} spaceId={spaceId} noun="flashcards" backHref={libraryHref} backLabel="Return to flashcards" />
      </section>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-6">
      {head}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,1fr)]">
        <StickyEndColumn>
          <SetupMaterialList picker={picker} spaceId={spaceId} noun="these flashcards" />
        </StickyEndColumn>

        <StickyEndColumn>
          <Card className="gap-5 p-6 max-sm:p-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="deck-name">Deck name</Label>
                <span className="text-sm text-muted-foreground">Optional</span>
              </div>
              <Input
                id="deck-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={SET_TITLE_MAX}
                placeholder="e.g. Week 4 key terms"
                aria-describedby="deck-name-help"
                disabled={submitting}
              />
              <p id="deck-name-help" className="text-sm text-muted-foreground">
                Leave it blank and we&apos;ll number it for you, like &ldquo;Deck 3&rdquo;. Its topics show as tags. You can rename it later.
              </p>
            </div>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold text-foreground">Card style</legend>
              <RadioGroup value={cardStyle} onValueChange={(value) => setCardStyle(value as CardStyle)} aria-label="Card style">
                {CARD_STYLES.map((style) => {
                  const picked = cardStyle === style;
                  return (
                    <label
                      key={style}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                        picked ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]" : "border-input bg-card hover:bg-surface-hover",
                      )}
                    >
                      <span className="sr-only">
                        <RadioGroupItem value={style} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-semibold">{CARD_STYLE_LABELS[style]}</span>
                        <span className="text-sm text-muted-foreground">{STYLE_HINTS[style]}</span>
                      </span>
                      {picked && <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-card-count">
                Number of cards ({CARD_COUNT_MIN}–{CARD_COUNT_MAX})
              </Label>
              <Input
                id="deck-card-count"
                type="number"
                inputMode="numeric"
                min={CARD_COUNT_MIN}
                max={CARD_COUNT_MAX}
                step={1}
                value={countText}
                onChange={(event) => setCountText(event.target.value)}
                aria-invalid={!countValid}
                aria-describedby={countValid ? undefined : "deck-card-count-error"}
                className="w-28"
              />
              {!countValid && (
                <p id="deck-card-count-error" role="alert" className="text-sm font-medium text-destructive">
                  {COUNT_ERROR}
                </p>
              )}
              {previewLine && <p className="text-sm text-muted-foreground">{previewLine}</p>}
            </div>

            <p className="text-sm text-muted-foreground">You rate each card yourself. Ratings never change your mastery.</p>

            {nothingSelected && (
              <p role="alert" className="text-sm font-medium text-destructive">
                Choose a ready material and at least one confirmed topic.
              </p>
            )}
            {tooManyTopics && (
              <Alert variant="destructive">
                <AlertTitle>More topics than cards</AlertTitle>
                <AlertDescription>{TOO_MANY_TOPICS_DECK_MESSAGE}</AlertDescription>
              </Alert>
            )}
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>We couldn&apos;t create these flashcards</AlertTitle>
                <AlertDescription>{submitError} Your selections are kept.</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate} aria-disabled={!canGenerate}>
                {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {submitting ? "Creating…" : "Create flashcards"}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={libraryHref} />}>
                Cancel
              </Button>
            </div>
          </Card>
        </StickyEndColumn>
      </div>
    </section>
  );
}
