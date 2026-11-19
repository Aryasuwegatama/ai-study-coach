"use client";

import Link from "next/link";
import { MoreHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/class-names";
import { formatPlannedOn } from "../plan-format";
import type { PlanItemResponse } from "../plan-schemas";

/**
 * One item in "My plan". The day is shown as the plain date the student picked
 * (or "Anytime"): no red and no relative words. Open items have a
 * "mark done" checkbox and an actions menu; done items have Undo.
 */
export function PlanItemRow({
  item,
  busy,
  onToggleDone,
  onEdit,
  onRemove,
}: {
  item: PlanItemResponse;
  busy: boolean;
  onToggleDone: (item: PlanItemResponse, done: boolean) => void;
  onEdit: (item: PlanItemResponse) => void;
  onRemove: (item: PlanItemResponse) => void;
}) {
  const done = item.doneAt !== null;
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-border bg-card p-4">
      {!done && (
        <Checkbox
          className="mt-1"
          checked={false}
          disabled={busy}
          aria-label={`Mark "${item.title}" done`}
          onCheckedChange={() => onToggleDone(item, true)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {item.href && !done ? (
          <Link href={item.href} className="min-w-0 rounded-sm text-sm font-medium text-foreground hover:underline">
            {item.title}
          </Link>
        ) : (
          <span className={cn("min-w-0 text-sm font-medium", done ? "text-muted-foreground line-through" : "text-foreground")}>{item.title}</span>
        )}
        <p className="text-xs text-muted-foreground">
          {item.spaceName ? `${item.spaceName} · ` : ""}
          {item.plannedOn ? `Planned for ${formatPlannedOn(item.plannedOn)}` : "Anytime"}
        </p>
      </div>
      {done ? (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-full" disabled={busy} onClick={() => onToggleDone(item, false)}>
          <Undo2 className="size-3.5" aria-hidden="true" />
          Undo
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`} disabled={busy} />}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(item)}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
