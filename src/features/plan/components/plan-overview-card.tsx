"use client";

import type { Ref } from "react";
import Link from "next/link";
import { Check, Circle, CircleCheck, CircleDashed, KanbanSquare, Play, Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { cn } from "@/lib/class-names";
import type { PlanItemResponse, PlanStage } from "../plan-schemas";
import { PLAN_STAGE_LABELS, itemsByStage } from "../plan-format";
import { PlanItemMeta, PlanItemTitle } from "./plan-item-meta";

/** To do cards shown under "Up next"; the rest are a link to the board. */
const UP_NEXT = 3;
export const PLAN_BOARD_HREF = "/plan/board";
export const STAGE_ICONS: Record<PlanStage, LucideIcon> = { todo: Circle, doing: CircleDashed, done: CircleCheck };

function PreviewRow({ item, busy, onMove }: { item: PlanItemResponse; busy: boolean; onMove: (item: PlanItemResponse, stage: PlanStage) => void }) {
  const titleId = `overview-${item.id}-title`;
  const doing = item.stage === "doing";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-border px-6 py-3 first:border-t-0 max-sm:px-4">
      <div className="min-w-[12rem] flex-1">
        <PlanItemTitle item={item} id={titleId} />
        <PlanItemMeta item={item} />
      </div>
      <Button type="button" variant="outline" disabled={busy} aria-describedby={titleId} onClick={() => onMove(item, doing ? "done" : "doing")}>
        {doing ? <Check aria-hidden="true" /> : <Play aria-hidden="true" />}
        {doing ? "Done" : "Start"}
      </Button>
    </li>
  );
}

function SectionHead({ icon: Icon, children, id }: { icon: LucideIcon; children: React.ReactNode; id: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 border-t border-border px-6 pt-4 pb-1 text-sm font-semibold tracking-normal text-muted-foreground max-sm:px-4">
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </h3>
  );
}

/**
 * The student's own plan at a glance (left column of My Plan): counts per
 * board column, what's in Doing, and the next To do cards, each with its one
 * move. Editing, removing and the Done list live on the board page.
 */
export function PlanOverviewCard({
  items,
  busy,
  onMove,
  onAdd,
  className,
  ref,
}: {
  items: PlanItemResponse[];
  busy: boolean;
  onMove: (item: PlanItemResponse, stage: PlanStage) => void;
  onAdd: () => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const columns = itemsByStage(items);
  const open = columns.todo.length + columns.doing.length;
  const moreTodo = columns.todo.length - UP_NEXT;

  return (
    <Card ref={ref} className={cn("gap-0 p-0", className)}>
      <header className="flex flex-col gap-4 p-6 max-sm:p-4">
        <div>
          <h2 id="plan-heading" className="flex items-center gap-2 text-section text-foreground">
            My plan <CountChip count={open} suffix="open" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your own board. Move a card when you start or finish it. Pick a day if you like; nothing is ever overdue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={PLAN_BOARD_HREF} />}>
            <KanbanSquare aria-hidden="true" />
            Open board
          </Button>
          <Button type="button" variant="outline" onClick={onAdd}>
            <Plus aria-hidden="true" />
            Add your own
          </Button>
        </div>
        <ul aria-label="Cards in each column" className="grid grid-cols-3 gap-2">
          {(["todo", "doing", "done"] as const).map((stage) => {
            const Icon = STAGE_ICONS[stage];
            return (
              <li key={stage}>
                <Link
                  href={`${PLAN_BOARD_HREF}#${stage}-column`}
                  className="flex min-h-11 flex-col gap-1 rounded-lg bg-secondary p-3 text-secondary-foreground outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:p-2"
                >
                  <span className="inline-flex items-center gap-1 text-sm font-semibold">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {PLAN_STAGE_LABELS[stage]}
                  </span>
                  <span className="text-page leading-tight font-semibold tabular-nums">{columns[stage].length}</span>
                  <span className="sr-only">{columns[stage].length === 1 ? "card" : "cards"}, open the board</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </header>

      <section aria-labelledby="doing-now-heading">
        <SectionHead icon={CircleDashed} id="doing-now-heading">
          Doing now
        </SectionHead>
        {columns.doing.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground max-sm:px-4">Nothing in Doing. Press Start on a card when you begin it.</p>
        ) : (
          <ul>
            {columns.doing.map((item) => (
              <PreviewRow key={item.id} item={item} busy={busy} onMove={onMove} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="up-next-heading">
        <SectionHead icon={Circle} id="up-next-heading">
          Up next in To do
        </SectionHead>
        {columns.todo.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground max-sm:px-4">
            {open === 0 ? "Your plan is empty. Add a suggestion or write your own." : "Nothing left in To do."}
          </p>
        ) : (
          <ul>
            {columns.todo.slice(0, UP_NEXT).map((item) => (
              <PreviewRow key={item.id} item={item} busy={busy} onMove={onMove} />
            ))}
          </ul>
        )}
        {moreTodo > 0 && (
          <p className="px-6 pb-4 text-sm max-sm:px-4">
            <Link href={`${PLAN_BOARD_HREF}#todo-column`} className="text-primary underline underline-offset-4 hover:text-primary-hover">
              {moreTodo} more in To do
            </Link>
          </p>
        )}
      </section>
    </Card>
  );
}
