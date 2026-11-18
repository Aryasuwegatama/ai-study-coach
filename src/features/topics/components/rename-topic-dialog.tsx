"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/class-names";
import { MAX_TOPIC_NAME, type TopicResponse } from "../topics-schemas";
import { TopicsClientError, topicsClient } from "../client/api-topics-client";

/**
 * Reuses `RenameSpaceDialog`'s layout (no Figma design for this; T-09c
 * plan: "Reuse the existing patterns"). Renaming keeps the topic's
 * history and mastery (PRD Section 2) — the server does this by updating
 * the same row, not here.
 */
export function RenameTopicDialog({
  topic,
  open,
  onOpenChange,
  onRenamed,
}: {
  topic: TopicResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (topic: TopicResponse) => void;
}) {
  const [name, setName] = useState(topic?.name ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Re-sync the field when a different topic opens the dialog — adjusted
  // during render (React's documented alternative to an effect for this),
  // the same pattern as `RenameSpaceDialog`.
  const [prevTopicId, setPrevTopicId] = useState(topic?.id ?? null);
  if ((topic?.id ?? null) !== prevTopicId) {
    setPrevTopicId(topic?.id ?? null);
    setName(topic?.name ?? "");
    setError(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic || pending) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Enter a topic name.");
      return;
    }
    if (trimmed.length > MAX_TOPIC_NAME) {
      setError(`Use ${MAX_TOPIC_NAME} characters or fewer.`);
      return;
    }

    setPending(true);
    setError(undefined);
    try {
      const updated = await topicsClient.update(topic.id, { name: trimmed });
      onRenamed(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof TopicsClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename topic</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-topic-name">Topic name</Label>
            <Input
              id="rename-topic-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              aria-invalid={!!error}
              className={cn(
                error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
              )}
            />
            {error && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2 rounded-full" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
