"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiMaterialsClient } from "@/features/materials/client/api-materials-client";
import { MaterialsClientError } from "@/features/materials/client/materials-client";
import { topicsClient, TopicsClientError } from "@/features/topics/client/api-topics-client";
import { QUESTION_COUNTS, QUIZ_API_ERRORS, spreadQuestions, type CreateQuizRequest } from "../quizzes-schemas";
import { QuizzesClientError, type QuizzesClient } from "../client/quizzes-client";

type QuestionCount = (typeof QUESTION_COUNTS)[number];

function isQuestionCount(value: number): value is QuestionCount {
  return (QUESTION_COUNTS as readonly number[]).includes(value);
}

/** The setup screen's own view of a material and its confirmed topics
 * (T-12b, gap 2) — joined client-side from `GET …/materials` and
 * `GET …/topics?materials=linked` (`TopicResponse.materialIds`), rather
 * than a dedicated endpoint. Not part of the `QuizzesClient` contract. */
type SetupTopic = { id: string; name: string };
type SetupMaterial = { id: string; name: string; ready: boolean; topics: SetupTopic[] };

function loadErrorMessage(err: unknown): string {
  if (err instanceof MaterialsClientError || err instanceof TopicsClientError) return err.message;
  return "Couldn't load your materials. Try again.";
}

/**
 * The Generate Quiz setup screen (issue #46 → #49; Figma node 49:18648,
 * Short answer removed and topic checkboxes added). `?topic=<topicId>`
 * ticks only that topic (and its material) — T-15a's "Practise this
 * topic" link depends on this exact behaviour. `?retry=<setId>` (this
 * task's own addition, for the failed card's "Try again") prefills the
 * same materials, topics and count as that quiz.
 */
export function QuizSetupForm({ spaceId, client }: { spaceId: string; client: QuizzesClient }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");
  const retryParam = searchParams.get("retry");

  const [materials, setMaterials] = useState<SetupMaterial[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<QuestionCount>(10);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Loads materials and their confirmed, linked topics, then applies the
  // initial selection: `?retry=` and `?topic=` each override the "every
  // Ready topic starts ticked" default. Every `setState` call below
  // happens after an `await` gap (inside this effect's own async
  // `load()`), the same shape `use-materials-list.ts` uses, so none of it
  // runs synchronously in the effect body itself.
  useEffect(() => {
    let ignore = false;
    const materialsClient = createApiMaterialsClient(spaceId);
    async function load() {
      try {
        const [materialRows, topicRows] = await Promise.all([materialsClient.list(), topicsClient.list(spaceId, { materials: "linked" })]);
        if (ignore) return;
        const list: SetupMaterial[] = materialRows.map((material) => ({
          id: material.id,
          name: material.originalName,
          ready: material.status === "ready",
          topics: topicRows.filter((topic) => topic.materialIds.includes(material.id)).map((topic) => ({ id: topic.id, name: topic.name })),
        }));
        setMaterials(list);

        if (retryParam) {
          try {
            const detail = await client.getSet(retryParam);
            if (ignore) return;
            setSelectedTopicIds(new Set(detail.set.topicIds));
            if (isQuestionCount(detail.set.requestedCount)) setCount(detail.set.requestedCount);
            return;
          } catch {
            // Falls through to the default selection below if the quiz can't be read.
          }
        } else if (topicParam) {
          setSelectedTopicIds(new Set([topicParam]));
          return;
        }

        const allTopicIds = list.filter((m) => m.ready).flatMap((m) => m.topics.map((t) => t.id));
        setSelectedTopicIds(new Set(allTopicIds));
      } catch (err) {
        if (ignore) return;
        setLoadError(loadErrorMessage(err));
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [client, spaceId, retryParam, topicParam]);

  // Next 16 keeps this page alive, hidden, after "Generate quiz" navigates
  // to the library (`preserving-ui-state.md`), so coming back would show
  // a stuck "Generating…" button. Reset the submit state when it's hidden;
  // the load effect above re-applies the selection on return.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setSubmitError(null);
    };
  }, []);

  const readyMaterials = useMemo(() => materials?.filter((m) => m.ready) ?? [], [materials]);
  const notReadyMaterials = useMemo(() => materials?.filter((m) => !m.ready) ?? [], [materials]);

  function materialChecked(material: SetupMaterial): boolean {
    return material.topics.length > 0 && material.topics.every((topic) => selectedTopicIds.has(topic.id));
  }

  function toggleMaterial(material: SetupMaterial, checked: boolean) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      for (const topic of material.topics) {
        if (checked) next.add(topic.id);
        else next.delete(topic.id);
      }
      return next;
    });
  }

  function toggleTopic(topicId: string, checked: boolean) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  }

  const selectedMaterialIds = readyMaterials
    .filter((material) => material.topics.some((topic) => selectedTopicIds.has(topic.id)))
    .map((material) => material.id);
  const selectedTopicCount = selectedTopicIds.size;
  const tooManyTopics = selectedTopicCount > count;
  const canGenerate = selectedMaterialIds.length > 0 && selectedTopicCount > 0 && !tooManyTopics && !submitting;

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
        materialIds: selectedMaterialIds,
        topicIds: [...selectedTopicIds],
        count,
      };
      await client.createQuiz(request);
      router.push(`/spaces/${spaceId}/quizzes`);
    } catch (err) {
      setSubmitError(err instanceof QuizzesClientError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {loadError}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (materials === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-[16px]" />
        <Skeleton className="h-24 w-full rounded-[16px]" />
      </div>
    );
  }

  if (readyMaterials.length === 0) {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-foreground">No Ready materials yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload and confirm topics for a material before generating a quiz.
            </p>
          </div>
          <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials`} />}>
            Go to Materials
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">Generate quiz</h2>

      <div className="flex flex-col gap-3">
        {readyMaterials.map((material) => (
          <Card key={material.id} className="rounded-[16px] p-4">
            <CardContent className="flex flex-col gap-3 p-0">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Checkbox
                  checked={materialChecked(material)}
                  onCheckedChange={(checked) => toggleMaterial(material, checked)}
                />
                {material.name}
              </label>
              <ul className="flex flex-col gap-2 pl-6">
                {material.topics.map((topic) => (
                  <li key={topic.id}>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={selectedTopicIds.has(topic.id)}
                        onCheckedChange={(checked) => toggleTopic(topic.id, checked)}
                      />
                      {topic.name}
                    </label>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {notReadyMaterials.map((material) => (
          <Card key={material.id} className="rounded-[16px] p-4 opacity-60">
            <CardContent className="flex items-center justify-between gap-2 p-0">
              <span className="text-sm font-medium text-muted-foreground">{material.name}</span>
              <span className="text-xs text-muted-foreground">Review needed</span>
            </CardContent>
          </Card>
        ))}
      </div>

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
