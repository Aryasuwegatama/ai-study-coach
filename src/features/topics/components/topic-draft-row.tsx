"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/class-names";

export type DraftRowView = {
  key: string;
  name: string;
  origin: "ai" | "manual";
  /** The AI's original suggested name, for the "Renamed from" caption. Null for manual rows. */
  originalName: string | null;
  removed: boolean;
};

/**
 * One row of the topic review editor (T-09c; Figma nodes 47:18698,
 * 47:18903): the name field, its "AI-suggested" pill and caption, or (once
 * removed) the removed note with Undo.
 */
export function TopicDraftRow({
  row,
  index,
  disabled,
  error,
  alreadyLinked,
  totalCount,
  undoDisabled,
  onNameChange,
  onRemove,
  onUndo,
  inputRef,
  undoRef,
}: {
  row: DraftRowView;
  index: number;
  disabled: boolean;
  error: string | null;
  alreadyLinked: boolean;
  totalCount: number;
  /** True while saving, or when the draft is already at `MAX_DRAFT_TOPICS`. */
  undoDisabled: boolean;
  onNameChange: (key: string, name: string) => void;
  onRemove: (key: string) => void;
  onUndo: (key: string) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  undoRef: (element: HTMLButtonElement | null) => void;
}) {
  const displayName = row.name.trim() || "Untitled topic";

  if (row.removed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {displayName} removed from this draft · Not included in the {totalCount} topics
        </p>
        <Button
          ref={undoRef}
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onUndo(row.key)}
          disabled={undoDisabled}
        >
          Undo
        </Button>
      </div>
    );
  }

  const caption =
    row.origin === "manual"
      ? "Added by you"
      : row.originalName && row.name.trim() !== row.originalName
        ? `Renamed from ${row.originalName}`
        : "AI suggestion";
  const fieldId = `topic-draft-name-${row.key}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor={fieldId} className="sr-only">
            Topic {index + 1} name
          </Label>
          <Input
            id={fieldId}
            ref={inputRef}
            value={row.name}
            onChange={(event) => onNameChange(row.key, event.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
            className={cn(
              error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
            )}
          />
        </div>
        {row.origin === "ai" && (
          <span className="mt-1.5 inline-flex h-6 w-fit shrink-0 items-center rounded-full bg-soft-purple px-2.5 text-xs font-semibold text-purple">
            AI-suggested
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0"
          aria-label={`Remove ${displayName}`}
          onClick={() => onRemove(row.key)}
          disabled={disabled}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {displayName} · {caption}
      </p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : alreadyLinked ? (
        <p className="text-xs font-medium text-green">Already in this space — will be linked</p>
      ) : null}
    </div>
  );
}
