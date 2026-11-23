"use client";

import { ArrowLeft, Check, MoreHorizontal, Pencil, Play, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PlanItemResponse, PlanStage } from "../plan-schemas";
import { PlanItemMeta, PlanItemTitle } from "./plan-item-meta";

/** The one main move for each column: To do → Start, Doing → Done, Done → Undo (back to To do). */
const MAIN_MOVE: Record<PlanStage, { to: PlanStage; label: string; Icon: typeof Play }> = {
  todo: { to: "doing", label: "Start", Icon: Play },
  doing: { to: "done", label: "Done", Icon: Check },
  done: { to: "todo", label: "Undo", Icon: Undo2 },
};

/**
 * One card on the plan board (`.kanban-card` in the redesign prototype): its
 * title, Study Space and day, one move button and a menu with the other
 * moves, Edit and Remove. Cards move with buttons, so the board works with a
 * keyboard and a screen reader; there is no drag-and-drop.
 */
export function PlanBoardCard({
  item,
  busy,
  onMove,
  onEdit,
  onRemove,
}: {
  item: PlanItemResponse;
  busy: boolean;
  onMove: (item: PlanItemResponse, stage: PlanStage) => void;
  onEdit: (item: PlanItemResponse) => void;
  onRemove: (item: PlanItemResponse) => void;
}) {
  const titleId = `board-${item.id}-title`;
  const main = MAIN_MOVE[item.stage];
  return (
    <Card className="gap-1 p-4 shadow-sm">
      <PlanItemTitle item={item} id={titleId} />
      <PlanItemMeta item={item} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant={item.stage === "done" ? "ghost" : "outline"}
          disabled={busy}
          aria-describedby={titleId}
          onClick={() => onMove(item, main.to)}
        >
          <main.Icon aria-hidden="true" />
          {main.label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${item.title}`} disabled={busy} />}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.stage === "todo" && (
              <DropdownMenuItem onClick={() => onMove(item, "done")}>
                <Check aria-hidden="true" />
                Move to Done
              </DropdownMenuItem>
            )}
            {item.stage !== "todo" && (
              <DropdownMenuItem onClick={() => onMove(item, "todo")}>
                <ArrowLeft aria-hidden="true" />
                Move back to To do
              </DropdownMenuItem>
            )}
            {item.stage !== "done" && (
              <DropdownMenuItem onClick={() => onEdit(item)}>
                <Pencil aria-hidden="true" />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(item)}>
              <Trash2 aria-hidden="true" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
