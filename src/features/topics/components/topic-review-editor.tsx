"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import type { MaterialResponse } from "@/features/materials/materials-schemas";
import { fileTypeLabel, formatMaterialSize } from "@/features/materials/materials-format";
import { MaterialTypeTile } from "@/features/materials/components/material-type-tile";
import { pluralise } from "@/lib/pluralise";
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
import { TopicLinkExistingDialog } from "./topic-link-existing-dialog";
import { TopicsConfirmedSummary } from "./topics-confirmed-summary";

type Row = DraftRowView & {
  id: string | null;
};

function toRows(items: DraftTopicResponse[]): Row[] {
  return sortDraftTopics(items).map((topic) => ({
    key: topic.id,
    id: topic.id,
    name: topic.name,
    description: topic.description,
    pages: topic.pages,
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
    if (firstIndex !== index) {
      errors.set(row.key, "This topic is already in your suggestions. Keep the existing suggestion or use a different name.");
    }
  });
  return errors;
}

type FormError = { kind: "save" | "confirm"; code: string | null; message: string };

function toFormError(kind: FormError["kind"], error: unknown): FormError {
  if (error instanceof TopicsClientError) return { kind, code: error.code, message: error.message };
  return { kind, code: null, message: "Something went wrong. Please try again." };
}

/**
 * The Confirm topics page's editor (T-09c; redesigned in the UI redesign,
 * Step 5): the material being confirmed, the suggestion cards, "Something
 * missing?" (Add topic, Link existing) and the confirmation summary rail.
 * Owns the draft's local state (rename/add/remove/restore/link), Save draft &
 * exit and Confirm, and switches to `TopicsConfirmedSummary` once confirmed.
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
  const [formError, setFormError] = useState<FormError | null>(null);
  const [confirmed, setConfirmed] = useState<TopicResponse[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // The number of suggestions the AI made from this file, as loaded. Fixed:
  // adding, removing or linking topics doesn't change what the file produced.
  const [suggestionCount] = useState(() => initialDraft.topics.filter((topic) => topic.origin === "ai").length);

  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const restoreRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTargetRef = useRef<{ key: string; target: "input" | "restore" } | null>(null);
  const tempIdRef = useRef(0);

  // Add/Remove/Restore move focus to the row they affect, after the DOM
  // updates (plan step 5: "Add topic... focuses it; Remove moves focus
  // sensibly").
  useEffect(() => {
    const pendingFocus = focusTargetRef.current;
    if (!pendingFocus) return;
    focusTargetRef.current = null;
    const element =
      pendingFocus.target === "input"
        ? inputRefs.current.get(pendingFocus.key)
        : restoreRefs.current.get(pendingFocus.key);
    element?.focus();
  }, [rows]);

  // "Leave site?" while there are unsaved edits (plan step 5); in-app
  // navigation is deliberately not blocked (PRD/plan: "isn't blocked,
  // only closing or refreshing the tab"), and nothing saves by itself.
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
  // The count check is a backstop: Add, Link and Restore all stop at the limit.
  const hasErrors = errors.size > 0 || visibleRows.length > MAX_DRAFT_TOPICS;
  const busy = pending !== null;

  // Rows whose name matches a confirmed topic link to it on confirm. Worked
  // out on every render, so it follows every rename.
  const linkCount = visibleRows.filter((row) =>
    normalizedConfirmed.has(normalizeTopicNameClient(row.name.trim())),
  ).length;

  // Confirmed topics that aren't already in this confirmation: what "Link
  // existing" offers.
  const draftNames = useMemo(
    () => new Set(visibleRows.map((row) => normalizeTopicNameClient(row.name.trim()))),
    [visibleRows],
  );
  const linkableNames = confirmedTopicNames.filter((name) => !draftNames.has(normalizeTopicNameClient(name)));

  function updateName(key: string, name: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, name } : row)));
    setDirty(true);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, removed: true } : row)));
    setDirty(true);
    focusTargetRef.current = { key, target: "restore" };
  }

  function restoreRow(key: string) {
    if (atLimit) return;
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, removed: false } : row)));
    setDirty(true);
    focusTargetRef.current = { key, target: "input" };
  }

  function addRow(name = "", focus = true) {
    if (atLimit) return;
    const key = `new-${tempIdRef.current++}`;
    setRows((prev) => [
      ...prev,
      { key, id: null, name, description: "", pages: [], origin: "manual", originalName: null, removed: false },
    ]);
    setDirty(true);
    if (focus) focusTargetRef.current = { key, target: "input" };
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
      setFormError(toFormError("save", error));
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
      setFormError(toFormError("confirm", error));
    } finally {
      setPending(null);
    }
  }

  if (confirmed) {
    return <TopicsConfirmedSummary spaceId={spaceId} materialsHref={materialsHref} topics={confirmed} />;
  }

  const canConfirm = !busy && !hasErrors && visibleRows.length > 0;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <header>
        <h2 className="text-section text-foreground">Confirm topics</h2>
        <p className="mt-1 max-w-[42rem] text-muted-foreground">
          Choose what you want to study. Rename, remove or add suggestions in any order.
        </p>
      </header>

      <Card role="region" aria-label="Material being confirmed" className="p-6 max-sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-72 items-start gap-4">
            <MaterialTypeTile fileName={material.originalName} />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold break-words text-foreground">{material.originalName}</h3>
              <p className="text-sm text-muted-foreground">
                {fileTypeLabel(material.originalName)} · {formatMaterialSize(material.sizeBytes)} ·{" "}
                {pluralise(suggestionCount, "suggestion")} from this file
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">Topics ready</Badge>
            <Button variant="ghost" nativeButton={false} render={<Link href={materialsHref} />}>
              Back to materials
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.9fr)]">
        <section aria-labelledby="suggestions-title" className="flex min-w-0 flex-col gap-4">
          <header>
            <h3 id="suggestions-title" className="flex items-center gap-2 text-card-title text-foreground">
              Suggested topics <CountChip count={visibleRows.length} />
            </h3>
            <p className="text-sm text-muted-foreground">
              Names are editable. Removing a suggestion does not delete a confirmed topic from your space.
            </p>
          </header>

          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <TopicDraftRow
                key={row.key}
                row={row}
                disabled={busy}
                error={row.removed ? null : (errors.get(row.key) ?? null)}
                alreadyLinked={!row.removed && normalizedConfirmed.has(normalizeTopicNameClient(row.name.trim()))}
                restoreDisabled={busy || atLimit}
                onNameChange={updateName}
                onRemove={removeRow}
                onRestore={restoreRow}
                inputRef={(element) => {
                  if (element) inputRefs.current.set(row.key, element);
                  else inputRefs.current.delete(row.key);
                }}
                restoreRef={(element) => {
                  if (element) restoreRefs.current.set(row.key, element);
                  else restoreRefs.current.delete(row.key);
                }}
              />
            ))}
          </div>

          <Card className="p-6 max-sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h4 className="font-semibold text-foreground">Something missing?</h4>
                <p className="text-sm text-muted-foreground">
                  Add a topic, or use one that&apos;s already in your space.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => addRow()} disabled={busy || atLimit}>
                  <Plus aria-hidden="true" />
                  Add topic
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLinkOpen(true)}
                  disabled={busy || atLimit || confirmedTopicNames.length === 0}
                >
                  Link existing
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <aside
          aria-label="Confirmation summary and existing topics"
          className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6"
        >
          <Card className="gap-4 p-6 max-sm:p-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">Confirmation summary</p>
              <h3 className="text-card-title text-foreground">Use the topics you&apos;ve chosen</h3>
              <p className="mt-1 text-muted-foreground">
                The suggestions you keep will be available for future quizzes and flashcards.
              </p>
            </div>

            <p aria-live="polite" className="text-sm font-semibold text-foreground">
              {pluralise(visibleRows.length, "topic")} selected
              {linkCount > 0 &&
                ` · ${linkCount === 1 ? "1 will link to an existing topic" : `${linkCount} will link to existing topics`}`}
            </p>

            <Alert variant="info" role="note">
              <AlertDescription>
                Matches with topics already in your space will be linked, keeping their existing practice history.
              </AlertDescription>
            </Alert>

            <div role="status" className="text-sm text-muted-foreground">
              {visibleRows.length === 0 &&
                "Keep or restore at least one suggestion, add a topic, or link an existing topic before confirming."}
            </div>

            {formError?.kind === "confirm" && (
              <Alert variant="destructive">
                <AlertTitle>We couldn&apos;t confirm these topics</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-2">
                  <span>Your choices are still here. Please try again.</span>
                  {formError.code !== null && <span>{formError.message}</span>}
                  {formError.code === "INVALID_MATERIAL_STATE" && (
                    <Link href={materialsHref} className="font-semibold underline underline-offset-4">
                      Return to Materials
                    </Link>
                  )}
                  <Button type="button" variant="outline" onClick={() => void handleConfirm()} disabled={!canConfirm}>
                    Try confirming again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {formError?.kind === "save" && (
              <Alert variant="destructive">
                <AlertTitle>We couldn&apos;t save your draft</AlertTitle>
                <AlertDescription>{formError.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => void handleConfirm()} disabled={!canConfirm}>
                {pending === "confirming" && <Loader2 className="animate-spin" aria-hidden="true" />}
                Confirm topics
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveAndExit()}
                disabled={busy || hasErrors}
              >
                {pending === "saving" && <Loader2 className="animate-spin" aria-hidden="true" />}
                Save draft &amp; exit
              </Button>
            </div>
          </Card>

          {confirmedTopicNames.length > 0 && (
            <details className="group overflow-hidden rounded-xl border border-border bg-card shadow-card">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-6 py-2 text-sm font-semibold text-primary outline-none marker:hidden focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:px-4 [&::-webkit-details-marker]:hidden">
                Already in your space <CountChip count={confirmedTopicNames.length} />
                <ChevronDown className="ml-auto size-5 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="flex flex-col gap-3 px-6 pb-6 max-sm:px-4">
                <p className="text-sm text-muted-foreground">
                  You can reuse one of these topics instead of creating another copy.
                </p>
                <ul className="list-disc pl-6 text-sm text-muted-foreground">
                  {confirmedTopicNames.map((name) => (
                    <li key={name} className="break-words [&:not(:first-child)]:mt-1">
                      {name}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() => setLinkOpen(true)}
                  disabled={busy || atLimit}
                >
                  Link existing topic
                </Button>
              </div>
            </details>
          )}
        </aside>
      </div>

      <TopicLinkExistingDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        topicNames={linkableNames}
        onLink={(name) => addRow(name, false)}
      />
    </div>
  );
}
