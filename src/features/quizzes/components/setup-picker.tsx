"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { MaterialStatus } from "@/features/materials/materials-schemas";
import { pluralise } from "@/lib/pluralise";
import { createApiMaterialsClient } from "@/features/materials/client/api-materials-client";
import { MaterialsClientError } from "@/features/materials/client/materials-client";
import { topicsClient, TopicsClientError } from "@/features/topics/client/api-topics-client";
import type { QuizzesClient } from "../client/quizzes-client";
import type { SetResponse } from "../quizzes-schemas";

/**
 * The materials-and-topics half of a generation setup screen, shared by the
 * Create quiz and Create flashcards forms (T-18 extracted it from
 * `quiz-setup-form.tsx` so decks don't copy it; the quiz form behaves as
 * before). The hook loads the Ready materials with their confirmed topics and
 * tracks what is ticked; `SetupPickerStatus` and `SetupMaterialList` draw it.
 */

/** A material and its confirmed topics, joined client-side from `GET …/materials`
 * and `GET …/topics?materials=linked` (`TopicResponse.materialIds`; T-12b, gap 2). */
type SetupTopic = { id: string; name: string };
type SetupMaterial = { id: string; name: string; ready: boolean; status: MaterialStatus; topics: SetupTopic[] };
type Selection = { materialIds: Set<string>; topicIds: Set<string> };

function loadErrorMessage(err: unknown): string {
  if (err instanceof MaterialsClientError || err instanceof TopicsClientError) return err.message;
  return "Couldn't load your materials. Try again.";
}

export type SetupPicker = {
  state: "loading" | "error" | "empty" | "ready";
  loadError: string | null;
  readyMaterials: SetupMaterial[];
  notReadyMaterials: SetupMaterial[];
  topicChecked: (material: SetupMaterial, topicId: string) => boolean;
  materialChecked: (material: SetupMaterial) => boolean;
  toggleMaterial: (material: SetupMaterial, checked: boolean) => void;
  toggleTopic: (material: SetupMaterial, topicId: string, checked: boolean) => void;
  /** What gets sent: Ready materials with at least one ticked topic, and only topics those materials offer. */
  selectedMaterialIds: string[];
  selectedTopicIds: string[];
  /** Loads the materials and topics again (the error state's "Try again"). */
  reload: () => void;
};

/**
 * `?topic=<topicId>` ticks only that topic (and its material); `?retry=<setId>`
 * prefills the same materials and topics as that set and calls `onRetryLoaded`
 * so the form can restore its own fields (count, card style). Otherwise every
 * Ready topic starts ticked. `client` and `onRetryLoaded` must be stable.
 *
 * Every `setState` below happens after an `await` gap (inside the effect's own
 * async `load()`), the same shape `use-materials-list.ts` uses.
 */
export function useSetupPicker({
  spaceId,
  topicParam,
  retryParam,
  client,
  onRetryLoaded,
}: {
  spaceId: string;
  topicParam: string | null;
  retryParam: string | null;
  client: Pick<QuizzesClient, "getSet">;
  onRetryLoaded: (set: SetResponse) => void;
}): SetupPicker {
  const [materials, setMaterials] = useState<SetupMaterial[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ materialIds: new Set(), topicIds: new Set() });
  const [loadRound, setLoadRound] = useState(0);

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
          status: material.status,
          topics: topicRows.filter((topic) => topic.materialIds.includes(material.id)).map((topic) => ({ id: topic.id, name: topic.name })),
        }));
        setMaterials(list);
        const ready = list.filter((m) => m.ready);

        if (retryParam) {
          try {
            const detail = await client.getSet(retryParam);
            if (ignore) return;
            // The set's own materials, not every material its topics touch.
            setSelection({ materialIds: new Set(detail.set.materialIds), topicIds: new Set(detail.set.topicIds) });
            onRetryLoaded(detail.set);
            return;
          } catch {
            // Falls through to the default selection below if the set can't be read.
          }
        } else if (topicParam) {
          const withTopic = ready.filter((m) => m.topics.some((t) => t.id === topicParam));
          setSelection({ materialIds: new Set(withTopic.map((m) => m.id)), topicIds: new Set([topicParam]) });
          return;
        }

        setSelection({
          materialIds: new Set(ready.map((m) => m.id)),
          topicIds: new Set(ready.flatMap((m) => m.topics.map((t) => t.id))),
        });
      } catch (err) {
        if (ignore) return;
        setLoadError(loadErrorMessage(err));
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [client, spaceId, retryParam, topicParam, onRetryLoaded, loadRound]);

  const readyMaterials = useMemo(() => materials?.filter((m) => m.ready) ?? [], [materials]);
  const notReadyMaterials = useMemo(() => materials?.filter((m) => !m.ready) ?? [], [materials]);

  // Materials and topics are tracked separately (Codex review on #50): a
  // confirmed topic can belong to several materials, and ticking it under
  // one must not select the others. The request still sends one list of
  // each, so a ticked topic is shown ticked under every selected material
  // it belongs to.
  function topicChecked(material: SetupMaterial, topicId: string): boolean {
    return selection.materialIds.has(material.id) && selection.topicIds.has(topicId);
  }

  function materialChecked(material: SetupMaterial): boolean {
    return material.topics.length > 0 && material.topics.every((topic) => topicChecked(material, topic.id));
  }

  function toggleMaterial(material: SetupMaterial, checked: boolean) {
    setSelection((prev) => {
      const materialIds = new Set(prev.materialIds);
      const topicIds = new Set(prev.topicIds);
      if (checked) {
        materialIds.add(material.id);
        for (const topic of material.topics) topicIds.add(topic.id);
      } else {
        materialIds.delete(material.id);
        // Keep a topic another selected material still offers.
        const keptElsewhere = new Set(
          readyMaterials.filter((m) => materialIds.has(m.id)).flatMap((m) => m.topics.map((t) => t.id)),
        );
        for (const topic of material.topics) if (!keptElsewhere.has(topic.id)) topicIds.delete(topic.id);
      }
      return { materialIds, topicIds };
    });
  }

  function toggleTopic(material: SetupMaterial, topicId: string, checked: boolean) {
    setSelection((prev) => {
      const materialIds = new Set(prev.materialIds);
      const topicIds = new Set(prev.topicIds);
      if (checked) {
        topicIds.add(topicId);
        materialIds.add(material.id);
      } else {
        topicIds.delete(topicId);
        if (!material.topics.some((t) => topicIds.has(t.id))) materialIds.delete(material.id);
      }
      return { materialIds, topicIds };
    });
  }

  const sentMaterials = readyMaterials.filter(
    (m) => selection.materialIds.has(m.id) && m.topics.some((t) => selection.topicIds.has(t.id)),
  );
  const offered = new Set(sentMaterials.flatMap((m) => m.topics.map((t) => t.id)));

  return {
    state: loadError ? "error" : materials === null ? "loading" : readyMaterials.length === 0 ? "empty" : "ready",
    loadError,
    readyMaterials,
    notReadyMaterials,
    topicChecked,
    materialChecked,
    toggleMaterial,
    toggleTopic,
    selectedMaterialIds: sentMaterials.map((m) => m.id),
    selectedTopicIds: [...selection.topicIds].filter((id) => offered.has(id)),
    reload: () => {
      setLoadError(null);
      setMaterials(null);
      setLoadRound((round) => round + 1);
    },
  };
}

/**
 * The load error, the loading skeleton, or "No ready materials yet": whatever
 * the picker shows instead of the form (redesign prototype `quiz-new.html`).
 */
export function SetupPickerStatus({
  picker,
  spaceId,
  noun,
  backHref,
  backLabel,
}: {
  picker: SetupPicker;
  spaceId: string;
  /** "a quiz" or "flashcards": "…before creating {noun}". */
  noun: string;
  /** Where the error state's second button goes, for example the Quizzes tab. */
  backHref?: string;
  backLabel?: string;
}) {
  if (picker.state === "error") {
    return (
      <Card role="alert" className="gap-4 p-6 max-sm:p-4">
        <h3 className="text-card-title text-foreground">We couldn&apos;t load your materials and topics</h3>
        <p className="text-muted-foreground">{picker.loadError} Check your connection and try again.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={picker.reload}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
          {backHref && backLabel && (
            <Button variant="ghost" nativeButton={false} render={<Link href={backHref} />}>
              {backLabel}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (picker.state === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <p className="sr-only" role="status">
          Loading your materials and topics.
        </p>
        {[0, 1].map((key) => (
          <Card key={key} className="gap-3 p-6" aria-hidden="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-2/5" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-card-title text-foreground">No ready materials yet</h3>
      <p className="max-w-[42rem] text-muted-foreground">Upload a material and confirm its topics before creating {noun}.</p>
      <Button nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials`} />}>
        Go to Materials
      </Button>
    </Card>
  );
}

/** Why a material can't be used yet, with its status pill. */
const NOT_READY: Record<Exclude<MaterialStatus, "ready">, { reason: string; label: string; tone: "amber" | "blue" | "red" }> = {
  review_topics: { reason: "Confirm its topic suggestions to use this file.", label: "Topics ready", tone: "amber" },
  processing: { reason: "The file is still being prepared.", label: "Processing", tone: "blue" },
  uploading: { reason: "The file is still uploading.", label: "Uploading", tone: "blue" },
  failed: { reason: "This file couldn't be processed. Retry it on the Materials tab.", label: "Failed", tone: "red" },
};

/**
 * "Materials and topics" (ready materials with their topic checkboxes) and
 * "Not available yet" (the rest, each with why and, for Topics ready, a link
 * to confirm them). `spaceId` turns on that link; `noun` names what is being
 * created ("this quiz", "these flashcards").
 */
export function SetupMaterialList({ picker, spaceId, noun = "this quiz" }: { picker: SetupPicker; spaceId?: string; noun?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-0 p-0">
        <header className="p-6 pb-4 max-sm:p-4">
          <h3 className="text-card-title text-foreground">Materials and topics</h3>
          <p className="mt-1 text-sm text-muted-foreground">Only ready materials and confirmed topics can be used.</p>
        </header>
        <ul>
          {picker.readyMaterials.map((material) => {
            return (
              <li key={material.id} className="border-t border-border px-6 py-4 max-sm:px-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={picker.materialChecked(material)}
                    onCheckedChange={(checked) => picker.toggleMaterial(material, checked)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold break-words text-foreground">{material.name}</span>
                    <span className="block text-sm text-muted-foreground">Ready · {pluralise(material.topics.length, "confirmed topic")}</span>
                  </span>
                </label>
                <fieldset className="mt-1 pl-8">
                  <legend className="sr-only">Confirmed topics from {material.name}</legend>
                  <ul className="flex flex-col">
                    {material.topics.map((topic) => {
                      return (
                        <li key={topic.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-foreground">
                            <Checkbox
                              checked={picker.topicChecked(material, topic.id)}
                              onCheckedChange={(checked) => picker.toggleTopic(material, topic.id, checked)}
                            />
                            <span className="min-w-0 break-words">{topic.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              </li>
            );
          })}
        </ul>
      </Card>

      {picker.notReadyMaterials.length > 0 && (
        <Card className="gap-0 p-0">
          <header className="p-6 pb-4 max-sm:p-4">
            <h3 className="text-card-title text-foreground">Not available for {noun} yet</h3>
          </header>
          <ul>
            {picker.notReadyMaterials.map((material) => {
              const info = NOT_READY[material.status as Exclude<MaterialStatus, "ready">] ?? NOT_READY.processing;
              return (
                <li key={material.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-6 py-4 max-sm:px-4">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-semibold break-words text-foreground">{material.name}</p>
                    <p className="text-sm text-muted-foreground">{info.reason}</p>
                  </div>
                  <Badge tone={info.tone}>{info.label}</Badge>
                  {spaceId && material.status === "review_topics" && (
                    <Button variant="outline" nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials/${material.id}/topics`} />}>
                      Confirm topics
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
