"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import type { PlanClient } from "../client/plan-client";
import { PLAN_STAGES, type PlanItemResponse, type PlanStage } from "../plan-schemas";
import { PLAN_STAGE_LABELS, itemsByStage } from "../plan-format";
import { planErrorMessage } from "./my-plan-view";
import { PlanBoardCard } from "./plan-board-card";
import { PlanItemDialog, type PlanItemFormValues } from "./plan-item-dialog";
import { STAGE_ICONS } from "./plan-overview-card";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PlanItemResponse[]; spaces: SpaceResponse[] };
type DialogState = { kind: "closed" } | { kind: "add" } | { kind: "edit"; item: PlanItemResponse };

const EMPTY_HINT: Record<PlanStage, string> = {
  todo: "Nothing to do yet. Add a suggestion or write your own.",
  doing: "Move a card here when you start it.",
  done: "Cards you finish land here.",
};

/**
 * Plan board (redesign prototype `plan-board.html`): the student's own plan as
 * three columns, To do, Doing and Done. Each card has one move button and a
 * menu; new cards go into To do. Days are ones the student picked, shown as
 * plain dates, never compared with today.
 */
export function PlanBoardView({ client }: { client: PlanClient }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [removeTarget, setRemoveTarget] = useState<PlanItemResponse | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([client.listItems(), client.listSpaces()])
      .then(([items, spaces]) => {
        if (!ignore) setState({ status: "ready", items, spaces });
      })
      .catch((error: unknown) => {
        if (!ignore) setState({ status: "error", message: planErrorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [client]);

  function reload() {
    setState({ status: "loading" });
    Promise.all([client.listItems(), client.listSpaces()])
      .then(([items, spaces]) => setState({ status: "ready", items, spaces }))
      .catch((error: unknown) => setState({ status: "error", message: planErrorMessage(error) }));
  }

  async function reloadItems() {
    const items = await client.listItems();
    setState((previous) => (previous.status === "ready" ? { ...previous, items } : previous));
  }

  async function mutate(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await work();
      await reloadItems();
    } catch (error) {
      setActionError(planErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitDialog(values: PlanItemFormValues) {
    if (dialog.kind === "edit") {
      await client.updateItem(dialog.item.id, { title: values.title, plannedOn: values.plannedOn });
    } else {
      await client.createItem({
        kind: "own",
        title: values.title,
        ...(values.plannedOn ? { plannedOn: values.plannedOn } : {}),
        ...(values.spaceId ? { spaceId: values.spaceId } : {}),
      });
    }
    await reloadItems();
  }

  const columns = state.status === "ready" ? itemsByStage(state.items) : null;
  const open = columns ? columns.todo.length + columns.doing.length : 0;

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" nativeButton={false} render={<Link href="/plan" />}>
          <ArrowLeft aria-hidden="true" />
          Back to My Plan
        </Button>
      </div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">My Plan</p>
          <h1 className="flex flex-wrap items-center gap-2 text-page-mobile text-foreground sm:text-page">
            Plan board {columns && <CountChip count={open} suffix="open" />}
          </h1>
          <p className="mt-2 max-w-[42rem] text-muted-foreground">
            Your own board. Move a card when you start or finish it. Pick a day if you like; nothing is ever overdue.
          </p>
        </div>
        <Button type="button" disabled={state.status !== "ready"} onClick={() => setDialog({ kind: "add" })}>
          <Plus aria-hidden="true" />
          Add your own
        </Button>
      </header>

      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {state.status === "error" ? (
        <Card role="alert" className="gap-4 p-6">
          <h2 className="text-card-title text-foreground">We couldn&apos;t load your board</h2>
          <p className="text-muted-foreground">{state.message} Your plan is still saved.</p>
          <div>
            <Button type="button" variant="outline" onClick={reload}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3" aria-busy={state.status === "loading"}>
          {state.status === "loading" && (
            <p className="sr-only" role="status">
              Loading your board.
            </p>
          )}
          {PLAN_STAGES.map((stage) => {
            const Icon = STAGE_ICONS[stage];
            const cards = columns?.[stage] ?? [];
            return (
              <section
                key={stage}
                id={`${stage}-column`}
                aria-labelledby={`${stage}-column-heading`}
                className="flex min-w-0 scroll-mt-6 flex-col gap-2 rounded-xl bg-secondary p-4"
              >
                <h2 id={`${stage}-column-heading`} className="flex items-center gap-2 px-1 pb-1 font-semibold tracking-normal text-secondary-foreground">
                  <Icon className={stage === "done" ? "size-4 text-green" : "size-4"} aria-hidden="true" />
                  {PLAN_STAGE_LABELS[stage]}
                  {columns && <CountChip count={cards.length} className="bg-card" />}
                </h2>
                {!columns ? (
                  [0, 1].map((key) => (
                    <Card key={key} className="gap-2 p-4" aria-hidden="true">
                      <Skeleton className="h-5 w-[85%]" />
                      <Skeleton className="h-4 w-1/2" />
                    </Card>
                  ))
                ) : cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
                    {open === 0 && stage === "todo" ? "Your plan is empty. Add a suggestion or write your own." : EMPTY_HINT[stage]}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cards.map((item) => (
                      <li key={item.id}>
                        <PlanBoardCard
                          item={item}
                          busy={busy}
                          onMove={(target, to) => void mutate(() => client.updateItem(target.id, { stage: to }))}
                          onEdit={(target) => setDialog({ kind: "edit", item: target })}
                          onRemove={setRemoveTarget}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Looking for ideas?{" "}
        <Link href="/plan" className="text-primary underline underline-offset-4 hover:text-primary-hover">
          See Suggested for you
        </Link>{" "}
        on My Plan.
      </p>

      {dialog.kind !== "closed" && state.status === "ready" && (
        <PlanItemDialog
          key={dialog.kind === "edit" ? dialog.item.id : "add"}
          open
          onOpenChange={(next) => !next && setDialog({ kind: "closed" })}
          item={dialog.kind === "edit" ? dialog.item : null}
          spaces={state.spaces}
          onSubmit={submitDialog}
        />
      )}

      <AlertDialog open={removeTarget !== null} onOpenChange={(next) => !next && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>&ldquo;{removeTarget?.title}&rdquo; will be removed from your plan. You can add it again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target) void mutate(() => client.deleteItem(target.id));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
