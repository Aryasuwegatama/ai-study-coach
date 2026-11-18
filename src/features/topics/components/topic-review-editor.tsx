"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MaterialResponse } from "@/features/materials/materials-schemas";
import { fileTypeLabel, formatMaterialSize } from "@/features/materials/materials-format";
import { MaterialStatusBadge } from "@/features/materials/components/material-status-badge";
import {
  MAX_DRAFT_TOPICS,
  MAX_TOPIC_NAME,
  type DraftTopicResponse,
  type SaveTopicDraftRequest,
  type TopicDraftResponse,
  type TopicResponse,
} from "../topics-schemas";
import { normalizeTopicNameClient, sortDraftTopics } from "../topics-format";
import { TopicsClientError, topicsClient } from "../client/api-topics-client";
import { TopicDraftRow, type DraftRowView } from "./topic-draft-row";
import { TopicsConfirmedSummary } from "./topics-confirmed-summary";

type Row = DraftRowView & {
  id: string | null;
  description: string;
};

function toRows(items: DraftTopicResponse[]): Row[] {
  return sortDraftTopics(items).map((topic) => ({
    key: topic.id,
    id: topic.id,
    name: topic.name,
    description: topic.description,
    origin: topic.origin,
    originalName: topic.origin === "ai" ? topic.name : null,
    removed: false,
  }));
}

/** Validation per visible row (plan step 5): empty/too-long names, and
 * duplicates within the list (ignoring case and spaces) — the first
 * occurrence is fine, a later one gets the duplicate message. */
function rowErrors(rows: Row[]): Map<string, string> {
  const errors = new Map<string, string>();
  rows.forEach((row, index) => {
    const trimmed = row.name.trim();
    if (trimmed.length === 0) {
      errors.set(row.key, "Enter a topic name.");
      return;
    }
    if (trimmed.length > MAX_TOPIC_NAME) {
      errors.set(row.key, `Use ${MAX_TOPIC_NAME} characters or fewer.`);
      return;
    }
    const normalized = normalizeTopicNameClient(trimmed);
    const firstIndex = rows.findIndex((other) => normalizeTopicNameClient(other.name.trim()) === normalized);
    if (firstIndex !== index) errors.set(row.key, "You already have this topic in the list.");
  });
  return errors;
}

function toFormError(error: unknown): { code: string | null; message: string } {
  if (error instanceof TopicsClientError) return { code: error.code, message: error.message };
  return { code: null, message: "Something went wrong. Please try again." };
}

/**
 * The topic review page's editor (T-09c; Figma nodes 47:18698, 47:18903).
 * Owns the draft's local state (rename/add/remove/undo), Save & exit,
 * Confirm, and switches to `TopicsConfirmedSummary` once confirmed.
 */
export function TopicReviewEditor({
  spaceId,
  materialId,
  material,
  initialDraft,
  confirmedTopicNames,
}: {
  spaceId: string;
  materialId: string;
  material: MaterialResponse;
  initialDraft: TopicDraftResponse;
  confirmedTopicNames: string[];
}) {
  const router = useRouter();
  const materialsHref = `/spaces/${spaceId}/materials`;

  const [rows, setRows] = useState<Row[]>(() => toRows(initialDraft.topics));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<"saving" | "confirming" | null>(null);
  const [formError, setFormError] = useState<{ code: string | null; message: string } | null>(null);
  const [confirmed, setConfirmed] = useState<TopicResponse[] | null>(null);

  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const undoRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTargetRef = useRef<{ key: string; target: "input" | "undo" } | null>(null);
  const tempIdRef = useRef(0);

  // Add/Remove/Undo move focus to the row they affect, after the DOM
  // updates (plan step 5: "Add topic... focuses it; Remove moves focus
  // sensibly").
  useEffect(() => {
    const pendingFocus = focusTargetRef.current;
    if (!pendingFocus) return;
    focusTargetRef.current = null;
    const element =
      pendingFocus.target === "input" ? inputRefs.current.get(pendingFocus.key) : undoRefs.current.get(pendingFocus.key);
    element?.focus();
  }, [rows]);

  // "Leave site?" while there are unsaved edits (plan step 5); in-app
  // navigation is deliberately not blocked (PRD/plan: "isn't blocked,
  // only closing or refreshing the tab").
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const normalizedConfirmed = useMemo(
    () => new Set(confirmedTopicNames.map((name) => normalizeTopicNameClient(name))),
    [confirmedTopicNames],
  );
  const visibleRows = useMemo(() => rows.filter((row) => !row.removed), [rows]);
  const errors = useMemo(() => rowErrors(visibleRows), [visibleRows]);
  const atLimit = visibleRows.length >= MAX_DRAFT_TOPICS;
  // The count check is a backstop: Add and Undo both stop at the limit.
  const hasErrors = errors.size > 0 || visibleRows.length > MAX_DRAFT_TOPICS;
  const busy = pending !== null;

  function updateName(key: string, name: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, name } : row)));
    setDirty(true);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, removed: true } : row)));
    setDirty(true);
    focusTargetRef.current = { key, target: "undo" };
  }

  function undoRow(key: string) {
    if (atLimit) return;
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, removed: false } : row)));
    setDirty(true);
    focusTargetRef.current = { key, target: "input" };
  }

  function addRow() {
    const key = `new-${tempIdRef.current++}`;
    setRows((prev) => [
      ...prev,
      { key, id: null, name: "", description: "", origin: "manual", originalName: null, removed: false },
    ]);
    setDirty(true);
    focusTargetRef.current = { key, target: "input" };
  }

  function buildPayload(): SaveTopicDraftRequest["topics"] {
    return visibleRows.map((row) => ({ id: row.id ?? undefined, name: row.name.trim(), description: row.description }));
  }

  async function handleSaveAndExit() {
    if (busy || hasErrors) return;
    setPending("saving");
    setFormError(null);
    try {
      await topicsClient.saveDraft(materialId, buildPayload());
      setDirty(false);
      router.push(materialsHref);
    } catch (error) {
      setFormError(toFormError(error));
    } finally {
      setPending(null);
    }
  }

  async function handleConfirm() {
    if (busy || hasErrors || visibleRows.length === 0) return;
    setPending("confirming");
    setFormError(null);
    try {
      await topicsClient.saveDraft(materialId, buildPayload());
      const result = await topicsClient.confirm(materialId);
      setDirty(false);
      setConfirmed(result.topics);
    } catch (error) {
      setFormError(toFormError(error));
    } finally {
      setPending(null);
    }
  }

  if (confirmed) {
    return <TopicsConfirmedSummary spaceId={spaceId} materialsHref={materialsHref} topics={confirmed} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-[20px] p-4">
        <CardContent className="flex flex-col gap-2 p-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium text-foreground">{material.originalName}</span>
            <span className="text-sm text-muted-foreground">
              {fileTypeLabel(material.originalName)} · {formatMaterialSize(material.sizeBytes)}
            </span>
          </div>
          <MaterialStatusBadge material={material} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{visibleRows.length} topics in draft</h2>
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full"
          onClick={addRow}
          disabled={busy || atLimit}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add topic
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <TopicDraftRow
            key={row.key}
            row={row}
            index={index}
            disabled={busy}
            error={errors.get(row.key) ?? null}
            alreadyLinked={!row.removed && normalizedConfirmed.has(normalizeTopicNameClient(row.name.trim()))}
            totalCount={visibleRows.length}
            undoDisabled={busy || atLimit}
            onNameChange={updateName}
            onRemove={removeRow}
            onUndo={undoRow}
            inputRef={(element) => {
              if (element) inputRefs.current.set(row.key, element);
              else inputRefs.current.delete(row.key);
            }}
            undoRef={(element) => {
              if (element) undoRefs.current.set(row.key, element);
              else undoRefs.current.delete(row.key);
            }}
          />
        ))}
      </div>

      {formError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError.message}
          {formError.code === "INVALID_MATERIAL_STATE" && (
            <>
              {" "}
              <Link href={materialsHref} className="underline underline-offset-2">
                Return to Materials
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full"
          onClick={() => void handleSaveAndExit()}
          disabled={busy || hasErrors}
        >
          {pending === "saving" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save & exit
        </Button>
        <Button
          type="button"
          className="gap-2 rounded-full"
          onClick={() => void handleConfirm()}
          disabled={busy || hasErrors || visibleRows.length === 0}
        >
          {pending === "confirming" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Confirm topics
        </Button>
      </div>
    </div>
  );
}
