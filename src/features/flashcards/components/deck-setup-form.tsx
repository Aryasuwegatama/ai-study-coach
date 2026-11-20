"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CARD_COUNT_MAX,
  CARD_COUNT_MIN,
  CARD_STYLES,
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
 * The Generate Flashcards setup screen (Figma node 61:25057, plus the card
 * style and the 1–20 card count the PRD adds). The materials-and-topics picker
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const restoreFromRetry = useCallback((set: SetResponse) => {
    if (isCardStyle(set.cardStyle)) setCardStyle(set.cardStyle);
    setCountText(String(set.requestedCount));
  }, []);
  const picker = useSetupPicker({ spaceId, topicParam, retryParam, client, onRetryLoaded: restoreFromRetry });

  // Next 16 keeps this page alive, hidden, after "Generate flashcards"
  // navigates to the library, so coming back would show a stuck "Generating…"
  // button. Reset the submit state when it's hidden.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setSubmitError(null);
    };
  }, []);

  const parsedCount = countText.trim() === "" ? NaN : Number(countText);
  const countValid = Number.isInteger(parsedCount) && parsedCount >= CARD_COUNT_MIN && parsedCount <= CARD_COUNT_MAX;
  const selectedTopicCount = picker.selectedTopicIds.length;
  const tooManyTopics = countValid && selectedTopicCount > parsedCount;
  const canGenerate = picker.selectedMaterialIds.length > 0 && selectedTopicCount > 0 && countValid && !tooManyTopics && !submitting;

  const previewLine =
    countValid && selectedTopicCount > 0 && !tooManyTopics
      ? `${cardCountLabel(parsedCount)} across ${selectedTopicCount} topic${selectedTopicCount === 1 ? "" : "s"}`
      : null;

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
      };
      await client.createDeck(request);
      router.push(`/spaces/${spaceId}/flashcards`);
    } catch (err) {
      setSubmitError(err instanceof FlashcardsClientError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (picker.state !== "ready") return <SetupPickerStatus picker={picker} spaceId={spaceId} noun="flashcards" />;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">Generate flashcards</h2>

      <SetupMaterialList picker={picker} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Card style</legend>
        <RadioGroup value={cardStyle} onValueChange={(value) => setCardStyle(value as CardStyle)} aria-label="Card style">
          {CARD_STYLES.map((style) => (
            <label
              key={style}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm text-foreground ${
                cardStyle === style ? "border-primary bg-soft-purple/30" : "border-border hover:bg-muted"
              }`}
            >
              <RadioGroupItem value={style} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{CARD_STYLE_LABELS[style]}</span>
                <span className="text-xs text-muted-foreground">{STYLE_HINTS[style]}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="deck-card-count" className="text-sm font-medium text-foreground">
          Number of cards ({CARD_COUNT_MIN}–{CARD_COUNT_MAX})
        </label>
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
          className="h-10 w-28 text-base"
        />
        {!countValid && (
          <p id="deck-card-count-error" role="alert" className="text-sm font-medium text-destructive">
            {COUNT_ERROR}
          </p>
        )}
      </div>

      {previewLine && <p className="text-sm text-muted-foreground">{previewLine}</p>}
      {tooManyTopics && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {TOO_MANY_TOPICS_DECK_MESSAGE}
        </p>
      )}
      {submitError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/flashcards`} />}>
          Cancel
        </Button>
        <Button
          type="button"
          className="rounded-full"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          aria-disabled={!canGenerate}
        >
          {submitting ? "Generating…" : "Generate flashcards"}
        </Button>
      </div>
    </div>
  );
}
