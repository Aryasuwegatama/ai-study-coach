"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import { cn } from "@/lib/class-names";
import { PLAN_TITLE_MAX, type PlanItemResponse } from "../plan-schemas";

export type PlanItemFormValues = { title: string; plannedOn: string | null; spaceId: string | null };

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * "Add your own" and "Edit" for a plan item: a title (1–120 characters), an
 * optional day the student picks ("Planned for"; empty means Anytime) and, when
 * adding, an optional Study Space. The server is the only place the rules are
 * checked; its message is shown as-is. Remounted each time it opens (see `key`
 * at the call site), so its fields always start from the item being edited.
 */
export function PlanItemDialog({
  open,
  onOpenChange,
  item,
  spaces,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item being edited, or null to add a new one of the student's own. */
  item: PlanItemResponse | null;
  spaces: SpaceResponse[];
  onSubmit: (values: PlanItemFormValues) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [plannedOn, setPlannedOn] = useState(item?.plannedOn ?? "");
  const [spaceId, setSpaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = item !== null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({ title, plannedOn: plannedOn || null, spaceId: spaceId || null });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR);
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add your own"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="plan-item-title">What do you want to do?</Label>
              <span className="text-sm text-muted-foreground">Required</span>
            </div>
            <Input
              id="plan-item-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={PLAN_TITLE_MAX}
              disabled={pending}
              aria-describedby="plan-item-title-help"
              autoFocus
            />
            <p id="plan-item-title-help" className="text-sm text-muted-foreground">
              Up to {PLAN_TITLE_MAX} characters.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-item-day">Planned for</Label>
            <Input id="plan-item-day" type="date" value={plannedOn} onChange={(event) => setPlannedOn(event.target.value)} disabled={pending} />
            <p className="text-sm text-muted-foreground">
              Optional. You pick the day; with no day it&apos;s Anytime.{!editing && " New cards go into To do."}
            </p>
          </div>

          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-item-space">Study space</Label>
              <select
                id="plan-item-space"
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
                disabled={pending}
                className={cn(
                  "h-11 w-full rounded-sm border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground md:text-sm",
                )}
              >
                <option value="">No study space</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">Optional.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save" : "Add to my plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
