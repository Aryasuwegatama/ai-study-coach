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
import { StickyEndColumn } from "@/components/sticky-end-column";
import { cn } from "@/lib/class-names";
import { QUESTION_COUNTS, QUIZ_API_ERRORS, SET_TITLE_MAX, spreadQuestions, type CreateQuizRequest, type SetResponse } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";
import { SetupMaterialList, SetupPickerStatus, useSetupPicker } from "./setup-picker";

type QuestionCount = (typeof QUESTION_COUNTS)[number];

function isQuestionCount(value: number): value is QuestionCount {
  return (QUESTION_COUNTS as readonly number[]).includes(value);
}

/**
 * The Create quiz screen (issue #46 → #49; redesign prototype
 * `quiz-new.html`): materials and topics on the left, the question count and
 * the Create button on the right. `?topic=<topicId>`
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
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const restoreFromRetry = useCallback((set: SetResponse) => {
    if (isQuestionCount(set.requestedCount)) setCount(set.requestedCount);
  }, []);
  const picker = useSetupPicker({ spaceId, topicParam, retryParam, client, onRetryLoaded: restoreFromRetry });

  // Next 16 keeps this page alive, hidden, after "Create quiz" navigates
  // to the library (`preserving-ui-state.md`), so coming back would show
  // a stuck "Creating…" button. Reset the submit state when it's hidden;
  // the picker's load effect re-applies the selection on return.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setSubmitError(null);
      setName("");
    };
  }, []);

  const selectedTopicCount = picker.selectedTopicIds.length;
  const tooManyTopics = selectedTopicCount > count;
  const canGenerate = picker.selectedMaterialIds.length > 0 && selectedTopicCount > 0 && !tooManyTopics && !submitting;

  const nothingSelected = selectedTopicCount === 0;
  // Hidden while there are more topics than questions: the spread would
  // show a 0 for the last topics, and the alert below already explains it.
  const spreadLine =
    nothingSelected || tooManyTopics
      ? null
      : `Across ${selectedTopicCount} topic${selectedTopicCount === 1 ? "" : "s"}: ${spreadQuestions(count, selectedTopicCount).join(", ")}`;
  const quizzesHref = `/spaces/${spaceId}/quizzes`;

  async function handleGenerate() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const request: CreateQuizRequest = {
        kind: "quiz",
        materialIds: picker.selectedMaterialIds,
        topicIds: picker.selectedTopicIds,
        count,
        // Blank: the server names it "Quiz N". Its topics show as tags, not in the name.
        ...(name.trim() ? { title: name.trim() } : {}),
      };
      await client.createQuiz(request);
      router.push(`/spaces/${spaceId}/quizzes`);
    } catch (err) {
      setSubmitError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const head = (
    <header>
      <h2 className="text-section text-foreground">Create quiz</h2>
      <p className="mt-1 max-w-[42rem] text-muted-foreground">Choose your materials, confirmed topics and number of questions.</p>
    </header>
  );

  if (picker.state !== "ready") {
    return (
      <section className="mt-6 flex flex-col gap-6">
        {head}
        <SetupPickerStatus picker={picker} spaceId={spaceId} noun="a quiz" backHref={quizzesHref} backLabel="Return to quizzes" />
      </section>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-6">
      {head}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,1fr)]">
        <StickyEndColumn>
          <SetupMaterialList picker={picker} spaceId={spaceId} noun="this quiz" />
        </StickyEndColumn>

        <StickyEndColumn>
          <Card className="gap-5 p-6 max-sm:p-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="quiz-name">Quiz name</Label>
                <span className="text-sm text-muted-foreground">Optional</span>
              </div>
              <Input
                id="quiz-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={SET_TITLE_MAX}
                placeholder="e.g. Week 4 normalisation practice"
                aria-describedby="quiz-name-help"
                disabled={submitting}
              />
              <p id="quiz-name-help" className="text-sm text-muted-foreground">
                Leave it blank and we&apos;ll number it for you, like &ldquo;Quiz 3&rdquo;. Its topics show as tags. You can rename it later.
              </p>
            </div>

            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-semibold text-foreground">Number of questions</legend>
              <div className="flex flex-wrap gap-2">
                {QUESTION_COUNTS.map((value) => {
                  const selected = count === value;
                  const id = `question-count-${value}`;
                  return (
                    <span key={value} className="relative inline-flex">
                      <input
                        type="radio"
                        id={id}
                        name="question-count"
                        value={value}
                        checked={selected}
                        onChange={() => setCount(value)}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          "inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                          selected
                            ? "border-primary bg-accent font-semibold text-accent-foreground"
                            : "border-border-strong bg-card font-medium text-muted-foreground hover:bg-surface-hover",
                        )}
                      >
                        {selected && <Check className="size-4" aria-hidden="true" />}
                        {value}
                      </label>
                    </span>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <p className="font-semibold text-foreground">{count} multiple-choice questions</p>
              <p className="text-sm text-muted-foreground">Questions are spread as evenly as possible across your selected topics.</p>
              {spreadLine && <p className="text-sm text-muted-foreground">{spreadLine}</p>}
            </div>

            <p className="text-sm text-muted-foreground">You&apos;ll see answers and explanations after submitting the whole quiz.</p>

            {nothingSelected && (
              <p role="alert" className="text-sm font-medium text-destructive">
                Choose a ready material and at least one confirmed topic.
              </p>
            )}
            {tooManyTopics && (
              <Alert variant="destructive">
                <AlertTitle>More topics than questions</AlertTitle>
                <AlertDescription>{QUIZ_API_ERRORS.TOO_MANY_TOPICS.message}</AlertDescription>
              </Alert>
            )}
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>We couldn&apos;t create this quiz</AlertTitle>
                <AlertDescription>{submitError} Your selections are kept.</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate} aria-disabled={!canGenerate}>
                {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {submitting ? "Creating…" : "Create quiz"}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={quizzesHref} />}>
                Cancel
              </Button>
            </div>
          </Card>
        </StickyEndColumn>
      </div>
    </section>
  );
}
