"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SET_TITLE_MAX } from "../quizzes-schemas";

/** What each kind of set is called, and what renaming leaves untouched. */
const WORDS = {
  quiz: { title: "Rename quiz", label: "Quiz name", empty: "Give this quiz a name.", kept: "Your results and questions stay the same." },
  deck: { title: "Rename deck", label: "Deck name", empty: "Give this deck a name.", kept: "Your cards and ratings stay the same." },
} as const;

/**
 * Rename a quiz or a deck (UI redesign, Arya, 2026-11-23): the name is the
 * only thing a student can change. Same layout as `RenameTopicDialog`.
 * `rename` calls the screen's own client; a client error's message is shown.
 */
export function RenameSetDialog({
  set: target,
  noun,
  open,
  onOpenChange,
  rename,
  onRenamed,
}: {
  set: { id: string; title: string } | null;
  noun: keyof typeof WORDS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rename: (setId: string, title: string) => Promise<unknown>;
  onRenamed: () => void;
}) {
  const words = WORDS[noun];
  const [name, setName] = useState(target?.title ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Re-sync the field when a different quiz or deck opens the dialog (adjusted during render, as in RenameTopicDialog).
  const [prevTargetId, setPrevTargetId] = useState(target?.id ?? null);
  if ((target?.id ?? null) !== prevTargetId) {
    setPrevTargetId(target?.id ?? null);
    setName(target?.title ?? "");
    setError(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target || pending) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(words.empty);
      return;
    }
    if (trimmed.length > SET_TITLE_MAX) {
      setError(`Keep the name to ${SET_TITLE_MAX} characters or fewer.`);
      return;
    }

    setPending(true);
    setError(undefined);
    try {
      await rename(target.id, trimmed);
      onRenamed();
      onOpenChange(false);
    } catch (err) {
      // Both clients throw an error with a server `code` and a message fit to show.
      setError(err instanceof Error && "code" in err ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{words.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-set-name">{words.label}</Label>
            <Input
              id="rename-set-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={SET_TITLE_MAX}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby="rename-set-help"
              autoFocus
            />
            <p id="rename-set-help" className="text-sm text-muted-foreground">
              Up to {SET_TITLE_MAX} characters. {words.kept}
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
