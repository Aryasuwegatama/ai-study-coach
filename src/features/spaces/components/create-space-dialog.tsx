"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpaceResponse } from "../spaces-schemas";
import { SpaceNameField } from "./space-name-field";

/**
 * Figma node 37:5057 / 80:6962 ("ready to create" and "required-name
 * error" states). The server (`spaceNameSchema`) is the only place the
 * name is validated — this dialog just shows whatever message it
 * returns, so there's one set of rules, not two that could drift apart.
 * On success it goes straight to the new space's Overview (plan step 6).
 */
export function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    if (!nextOpen) {
      setName("");
      setError(undefined);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);

    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }

      const space = body.space as SpaceResponse;
      setName("");
      onOpenChange(false);
      router.push(`/spaces/${space.id}/overview`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[528px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create study space</DialogTitle>
          </DialogHeader>
          <SpaceNameField
            id="create-space-name"
            value={name}
            onChange={setName}
            error={error}
            disabled={pending}
          />
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
            <Button type="submit" className="rounded-full gap-2" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Create study space
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
