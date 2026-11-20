"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiMaterialsClient } from "@/features/materials/client/api-materials-client";
import { MaterialsClientError } from "@/features/materials/client/materials-client";
import { topicsClient, TopicsClientError } from "@/features/topics/client/api-topics-client";
import type { QuizzesClient } from "../client/quizzes-client";
import type { SetResponse } from "../quizzes-schemas";

/**
 * The materials-and-topics half of a generation setup screen, shared by the
 * Generate quiz and Generate flashcards forms (T-18 extracted it from
 * `quiz-setup-form.tsx` so decks don't copy it; the quiz form behaves as
 * before). The hook loads the Ready materials with their confirmed topics and
 * tracks what is ticked; `SetupPickerStatus` and `SetupMaterialList` draw it.
 */

/** A material and its confirmed topics, joined client-side from `GET …/materials`
 * and `GET …/topics?materials=linked` (`TopicResponse.materialIds`; T-12b, gap 2). */
type SetupTopic = { id: string; name: string };
type SetupMaterial = { id: string; name: string; ready: boolean; topics: SetupTopic[] };
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
  }, [client, spaceId, retryParam, topicParam, onRetryLoaded]);

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
  };
}

/** The load error, the loading skeleton, or "No Ready materials yet" — whatever the picker shows instead of the form. */
export function SetupPickerStatus({
  picker,
  spaceId,
  noun,
}: {
  picker: SetupPicker;
  spaceId: string;
  /** "a quiz" or "flashcards": "…before generating {noun}". */
  noun: string;
}) {
  if (picker.state === "error") {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {picker.loadError}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (picker.state === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-[16px]" />
        <Skeleton className="h-24 w-full rounded-[16px]" />
      </div>
    );
  }

  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">No Ready materials yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload and confirm topics for a material before generating {noun}.
          </p>
        </div>
        <Button type="button" className="rounded-full" nativeButton={false} render={<Link href={`/spaces/${spaceId}/materials`} />}>
          Go to Materials
        </Button>
      </CardContent>
    </Card>
  );
}

/** Ready materials with their topic checkboxes, then the Review-needed ones, disabled. */
export function SetupMaterialList({ picker }: { picker: SetupPicker }) {
  return (
    <div className="flex flex-col gap-3">
      {picker.readyMaterials.map((material) => (
        <Card key={material.id} className="rounded-[16px] p-4">
          <CardContent className="flex flex-col gap-3 p-0">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Checkbox
                checked={picker.materialChecked(material)}
                onCheckedChange={(checked) => picker.toggleMaterial(material, checked)}
              />
              {material.name}
            </label>
            <ul className="flex flex-col gap-2 pl-6">
              {material.topics.map((topic) => (
                <li key={topic.id}>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={picker.topicChecked(material, topic.id)}
                      onCheckedChange={(checked) => picker.toggleTopic(material, topic.id, checked)}
                    />
                    {topic.name}
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {picker.notReadyMaterials.map((material) => (
        <Card key={material.id} className="rounded-[16px] p-4 opacity-60">
          <CardContent className="flex items-center justify-between gap-2 p-0">
            <span className="text-sm font-medium text-muted-foreground">{material.name}</span>
            <span className="text-xs text-muted-foreground">Review needed</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
