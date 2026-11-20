"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QUESTION_COUNTS, QUIZ_API_ERRORS, spreadQuestions, type CreateQuizRequest, type SetResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";
import { SetupMaterialList, SetupPickerStatus, useSetupPicker } from "./setup-picker";

type QuestionCount = (typeof QUESTION_COUNTS)[number];

function isQuestionCount(value: number): value is QuestionCount {
  return (QUESTION_COUNTS as readonly number[]).includes(value);
}

/**
 * The Generate Quiz setup screen (issue #46 → #49; Figma node 49:18648,
 * Short answer removed and topic checkboxes added). `?topic=<topicId>`
 * ticks only that topic (and its material) — T-15a's "Practise this
 * topic" link depends on this exact behaviour. `?retry=<setId>` (this
 * task's own addition, for the failed card's "Try again") prefills the
 * same materials, topics and count as that quiz. The materials-and-topics
 * picker is shared with the flashcards setup (`setup-picker.tsx`).
 */
export function QuizSetupForm({ spaceId, client }: { spaceId: string; client: QuizzesClient }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");
  const retryParam = searchParams.get("retry");

  const [count, setCount] = useState<QuestionCount>(10);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const restoreFromRetry = useCallback((set: SetResponse) => {
    if (isQuestionCount(set.requestedCount)) setCount(set.requestedCount);
  }, []);
  const picker = useSetupPicker({ spaceId, topicParam, retryParam, client, onRetryLoaded: restoreFromRetry });

  // Next 16 keeps this page alive, hidden, after "Generate quiz" navigates
  // to the library (`preserving-ui-state.md`), so coming back would show
  // a stuck "Generating…" button. Reset the submit state when it's hidden;
  // the picker's load effect re-applies the selection on return.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setSubmitError(null);
    };
  }, []);

  const selectedTopicCount = picker.selectedTopicIds.length;
  const tooManyTopics = selectedTopicCount > count;
  const canGenerate = picker.selectedMaterialIds.length > 0 && selectedTopicCount > 0 && !tooManyTopics && !submitting;

  // Hidden while there are more topics than questions: the spread would
  // show a 0 for the last topics, and the error below already explains it.
  const previewLine =
    selectedTopicCount === 0 || tooManyTopics
      ? null
      : `${count} questions across ${selectedTopicCount} topic${selectedTopicCount === 1 ? "" : "s"} (${spreadQuestions(count, selectedTopicCount).join(", ")})`;

  async function handleGenerate() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const request: CreateQuizRequest = {
        kind: "quiz",
        materialIds: picker.selectedMaterialIds,
        topicIds: picker.selectedTopicIds,
        count,
      };
      await client.createQuiz(request);
      router.push(`/spaces/${spaceId}/quizzes`);
    } catch (err) {
      setSubmitError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (picker.state !== "ready") return <SetupPickerStatus picker={picker} spaceId={spaceId} noun="a quiz" />;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">Generate quiz</h2>

      <SetupMaterialList picker={picker} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Number of questions</span>
        <div className="flex gap-2">
          {QUESTION_COUNTS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={count === value ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setCount(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      {previewLine && <p className="text-sm text-muted-foreground">{previewLine}</p>}
      {tooManyTopics && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {QUIZ_API_ERRORS.TOO_MANY_TOPICS.message}
        </p>
      )}
      {submitError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/quizzes`} />}>
          Cancel
        </Button>
        <Button
          type="button"
          className="rounded-full"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          aria-disabled={!canGenerate}
        >
          {submitting ? "Generating…" : "Generate quiz"}
        </Button>
      </div>
    </div>
  );
}
