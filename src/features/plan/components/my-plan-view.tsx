"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ListTodo, Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import { PlanClientError, type PlanClient } from "../client/plan-client";
import { isInPlan } from "../plan-format";
import type { PlanItemResponse, Suggestion } from "../plan-schemas";
import { PlanItemDialog, type PlanItemFormValues } from "./plan-item-dialog";
import { PlanItemRow } from "./plan-item-row";
import { SuggestionRow } from "./suggestion-row";

const SUGGESTIONS_SHOWN = 8;
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const messageOf = (error: unknown) => (error instanceof PlanClientError ? error.message : GENERIC_ERROR_MESSAGE);

type Loaded = { items: PlanItemResponse[]; suggestions: Suggestion[]; spaces: SpaceResponse[] };
type LoadState = { status: "loading" } | { status: "error"; message: string } | ({ status: "ready" } & Loaded);
type DialogState = { kind: "closed" } | { kind: "add" } | { kind: "edit"; item: PlanItemResponse };

/**
 * My Plan (T-15; Figma 65:44462 for the layout only): suggestions built from the
 * student's analytics, and the student's own plan. The app never sets a day
 * for anything: a day is only ever one the student picked, shown as a plain date.
 *
 * Loads on mount (and so again whenever the route becomes visible, as Cache
 * Components keeps hidden routes mounted and re-runs their effects), so it is
 * always current after a quiz or a review. After each change the items are
 * re-read, and "In my plan" is worked out from them.
 */
export function MyPlanView({ client }: { client: PlanClient }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [removeTarget, setRemoveTarget] = useState<PlanItemResponse | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([client.listItems(), client.listSuggestions(), client.listSpaces()])
      .then(([items, suggestions, spaces]) => {
        if (!ignore) setState({ status: "ready", items, suggestions, spaces });
      })
      .catch((error: unknown) => {
        if (!ignore) setState({ status: "error", message: messageOf(error) });
      });
    return () => {
      ignore = true;
    };
  }, [client]);

  function reload() {
    setState({ status: "loading" });
    Promise.all([client.listItems(), client.listSuggestions(), client.listSpaces()])
      .then(([items, suggestions, spaces]) => setState({ status: "ready", items, suggestions, spaces }))
      .catch((error: unknown) => setState({ status: "error", message: messageOf(error) }));
  }

  async function reloadItems() {
    const items = await client.listItems();
    setState((previous) => (previous.status === "ready" ? { ...previous, items } : previous));
  }

  /** A change from a button on the page: one at a time, its error shown above the list. */
  async function mutate(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await work();
      await reloadItems();
    } catch (error) {
      setActionError(messageOf(error));
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

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28 w-full rounded-[20px]" />
        <Skeleton className="h-28 w-full rounded-[20px]" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="rounded-[20px] p-8">
        <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <p role="alert" className="max-w-sm text-sm text-muted-foreground">
            {state.message}
          </p>
          <Button type="button" className="rounded-full" onClick={reload}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { items, suggestions, spaces } = state;
  const open = items.filter((item) => item.doneAt === null);
  const done = items.filter((item) => item.doneAt !== null);
  const shown = showAll ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">My Plan</h1>
        <p className="text-sm text-muted-foreground">Suggestions come from your quiz results. You decide what to study and when.</p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="suggested-heading">
        <h2 id="suggested-heading" className="text-xl font-semibold text-foreground">
          Suggested for you
        </h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suggestions yet. Take a quiz to get some.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {shown.map((suggestion) => (
                <li key={suggestion.key}>
                  <SuggestionRow
                    suggestion={suggestion}
                    inPlan={isInPlan(suggestion.plan, items)}
                    busy={busy}
                    onAdd={(s) => void mutate(() => client.createItem({ ...s.plan, title: s.title }))}
                  />
                </li>
              ))}
            </ul>
            {suggestions.length > SUGGESTIONS_SHOWN && (
              <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show fewer" : `Show all (${suggestions.length})`}
              </Button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="plan-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plan-heading" className="text-xl font-semibold text-foreground">
            My plan
          </h2>
          <Button type="button" className="gap-1.5 rounded-full" onClick={() => setDialog({ kind: "add" })}>
            <Plus className="size-4" aria-hidden="true" />
            Add your own
          </Button>
        </div>

        {actionError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {actionError}
          </p>
        )}

        {open.length === 0 ? (
          <Card className="rounded-[20px] p-8">
            <CardContent className="flex flex-col items-center gap-3 p-0 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-soft-purple text-purple">
                <ListTodo className="size-6" aria-hidden="true" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">Your plan is empty. Add a suggestion or write your own.</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((item) => (
              <li key={item.id}>
                <PlanItemRow
                  item={item}
                  busy={busy}
                  onToggleDone={(target, value) => void mutate(() => client.updateItem(target.id, { done: value }))}
                  onEdit={(target) => setDialog({ kind: "edit", item: target })}
                  onRemove={setRemoveTarget}
                />
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <details className="group rounded-[20px] border border-border bg-card p-4">
            <summary className="cursor-pointer rounded-sm text-sm font-semibold text-foreground">Done ({done.length})</summary>
            <ul className="mt-3 flex flex-col gap-3">
              {done.map((item) => (
                <li key={item.id}>
                  <PlanItemRow
                    item={item}
                    busy={busy}
                    onToggleDone={(target, value) => void mutate(() => client.updateItem(target.id, { done: value }))}
                    onEdit={(target) => setDialog({ kind: "edit", item: target })}
                    onRemove={setRemoveTarget}
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {dialog.kind !== "closed" && (
        <PlanItemDialog
          key={dialog.kind === "edit" ? dialog.item.id : "add"}
          open
          onOpenChange={(next) => !next && setDialog({ kind: "closed" })}
          item={dialog.kind === "edit" ? dialog.item : null}
          spaces={spaces}
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
    </div>
  );
}
