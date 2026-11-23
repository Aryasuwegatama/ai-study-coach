"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDraftPages } from "../topics-format";

export type DraftRowView = {
  key: string;
  name: string;
  description: string;
  /** Pages, slides or sections where the AI found it; empty for manual topics. */
  pages: number[];
  origin: "ai" | "manual";
  /** The AI's original suggested name, for the "Renamed from" caption. Null for manual rows. */
  originalName: string | null;
  removed: boolean;
};

/**
 * One suggestion card in the Confirm topics editor (`.suggestion-card` in the
 * redesign prototype): the editable name, the "AI-suggested" pill (PRD Section
 * 2 requires it until confirmation), the description, where the AI found it,
 * and a green badge when the name matches a topic already in the space. A
 * removed suggestion is dimmed, with a note and a Restore button.
 */
export function TopicDraftRow({
  row,
  disabled,
  error,
  alreadyLinked,
  restoreDisabled,
  onNameChange,
  onRemove,
  onRestore,
  inputRef,
  restoreRef,
}: {
  row: DraftRowView;
  disabled: boolean;
  error: string | null;
  alreadyLinked: boolean;
  /** True while saving, or when the draft is already at `MAX_DRAFT_TOPICS`. */
  restoreDisabled: boolean;
  onNameChange: (key: string, name: string) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  restoreRef: (element: HTMLButtonElement | null) => void;
}) {
  const displayName = row.name.trim() || "Untitled topic";

  if (row.removed) {
    return (
      <Card className="gap-2 border-dashed bg-card/60 p-6 opacity-80 max-sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="min-w-0 flex-1 text-card-title break-words text-muted-foreground line-through">
            {displayName}
          </h4>
          <Button
            ref={restoreRef}
            type="button"
            variant="outline"
            onClick={() => onRestore(row.key)}
            disabled={restoreDisabled}
            aria-label={`Restore ${displayName}`}
          >
            Restore
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Removed from this confirmation. You can restore it any time.
        </p>
      </Card>
    );
  }

  const pagesText = row.origin === "ai" ? formatDraftPages(row.pages) : null;
  const renamedFrom =
    row.origin === "ai" && row.originalName && row.name.trim() !== row.originalName
      ? `Renamed from ${row.originalName}`
      : row.origin === "manual"
        ? "Added by you"
        : null;
  const fieldId = `topic-draft-name-${row.key}`;
  const descriptionId = `topic-draft-description-${row.key}`;
  const errorId = `topic-draft-error-${row.key}`;
  const describedBy = [row.description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <Card aria-label={`Suggested topic: ${displayName}`} className="gap-2 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <Label htmlFor={fieldId} className="sr-only">
            Topic name
          </Label>
          <Input
            id={fieldId}
            ref={inputRef}
            value={row.name}
            onChange={(event) => onNameChange(row.key, event.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={describedBy || undefined}
            className="text-card-title"
          />
        </div>
        {row.origin === "ai" && (
          <Badge tone="purple" className="mt-2.5 shrink-0 max-sm:mt-0 max-sm:self-center">
            AI-suggested
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 max-sm:ml-auto"
          aria-label={`Remove ${displayName}`}
          onClick={() => onRemove(row.key)}
          disabled={disabled}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      {row.description && (
        <p id={descriptionId} className="text-muted-foreground">
          {row.description}
        </p>
      )}
      {(pagesText || renamedFrom || alreadyLinked) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          {pagesText && <span className="text-sm text-muted-foreground">{pagesText}</span>}
          {renamedFrom && <span className="text-sm text-muted-foreground">{renamedFrom}</span>}
          {alreadyLinked && !error && <Badge tone="green">Will link to your existing topic</Badge>}
        </div>
      )}
    </Card>
  );
}
