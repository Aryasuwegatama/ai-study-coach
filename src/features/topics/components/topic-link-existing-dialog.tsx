"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Link an existing topic": lists the space's confirmed topics that aren't
 * already in this confirmation. Choosing one adds a draft topic with that
 * topic's exact name, and the server's existing rule (a name that matches a
 * confirmed topic links to it on confirm) does the linking, keeping the
 * topic's practice history. Nothing is sent from here.
 */
export function TopicLinkExistingDialog({
  open,
  onOpenChange,
  topicNames,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Confirmed topic names that aren't in the draft yet. */
  topicNames: string[];
  onLink: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Start each opening with nothing chosen: adjusted during render (React's
  // documented alternative to an effect for this), not in a `useEffect`.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSelected(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (selected === null) return;
            onLink(selected);
            onOpenChange(false);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Link an existing topic</DialogTitle>
            <DialogDescription>
              Use a topic already in this Study Space. Its existing practice history will be kept.
            </DialogDescription>
          </DialogHeader>

          {topicNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All of your existing topics are already in this confirmation.
            </p>
          ) : (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-semibold">Choose a confirmed topic</legend>
              <div className="flex max-h-64 flex-col overflow-y-auto">
                {topicNames.map((name, index) => {
                  const id = `link-existing-topic-${index}`;
                  return (
                    <div key={name} className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        id={id}
                        name="link-existing-topic"
                        value={name}
                        checked={selected === name}
                        onChange={() => setSelected(name)}
                        className="size-5 shrink-0 cursor-pointer accent-primary"
                      />
                      <label htmlFor={id} className="cursor-pointer text-sm break-words">
                        {name}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={selected === null}>
              Link topic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
