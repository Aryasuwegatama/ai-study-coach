"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountChip } from "@/components/count-chip";
import { PageHead } from "@/components/page-container";
import { StickyEndColumn } from "@/components/sticky-end-column";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";
import { PlanClientError, type PlanClient } from "../client/plan-client";
import type { PlanItemResponse, PlanStage, Suggestion } from "../plan-schemas";
import { isInPlan } from "../plan-format";
import { PlanItemDialog, type PlanItemFormValues } from "./plan-item-dialog";
import { PlanOverviewCard } from "./plan-overview-card";
import { SuggestionRow } from "./suggestion-row";

const SUGGESTIONS_SHOWN = 8;
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const planErrorMessage = (error: unknown) => (error instanceof PlanClientError ? error.message : GENERIC_ERROR_MESSAGE);

type Loaded = { items: PlanItemResponse[]; suggestions: Suggestion[]; spaces: SpaceResponse[] };
type LoadState = { status: "loading" } | { status: "error"; message: string } | ({ status: "ready" } & Loaded);

/** Two columns from `lg`: the student's plan on the left, suggestions on the right. */
const LAYOUT = "grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]";

/**
 * My Plan (T-15; redesign prototype `my-plan.html`): the student's own plan at
 * a glance next to the suggestions built from their analytics. The full board
 * (To do, Doing, Done) is its own page, `/plan/board`. The app never sets a
 * day for anything: a day is only ever one the student picked.
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
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let ignore = false;
    Promise.all([client.listItems(), client.listSuggestions(), client.listSpaces()])
      .then(([items, suggestions, spaces]) => {
        if (!ignore) setState({ status: "ready", items, suggestions, spaces });
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
    Promise.all([client.listItems(), client.listSuggestions(), client.listSpaces()])
      .then(([items, suggestions, spaces]) => setState({ status: "ready", items, suggestions, spaces }))
      .catch((error: unknown) => setState({ status: "error", message: planErrorMessage(error) }));
  }

  async function reloadItems() {
    const items = await client.listItems();
    setState((previous) => (previous.status === "ready" ? { ...previous, items } : previous));
  }

  /** A change from a button on the page: one at a time, its error shown above the plan. */
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

  async function addOwn(values: PlanItemFormValues) {
    await client.createItem({
      kind: "own",
      title: values.title,
      ...(values.plannedOn ? { plannedOn: values.plannedOn } : {}),
      ...(values.spaceId ? { spaceId: values.spaceId } : {}),
    });
    await reloadItems();
  }

  const head = (
    <PageHead title="My Plan" subtitle="Suggestions come from your quiz results. You decide what to study and when." />
  );

  if (state.status === "loading") {
    return (
      <>
        {head}
        <div className={LAYOUT} aria-busy="true">
          <p className="sr-only" role="status">
            Loading My Plan.
          </p>
          <Card className="gap-4 p-6" aria-hidden="true">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-[85%]" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </Card>
          <div className="flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((key) => (
              <Card key={key} className="gap-2 p-6">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-5 w-[85%]" />
                <Skeleton className="h-11 w-40" />
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        {head}
        <Card role="alert" className="gap-4 p-6">
          <h2 className="text-card-title text-foreground">We couldn&apos;t load My Plan</h2>
          <p className="text-muted-foreground">{state.message} Your plan is still saved.</p>
          <div>
            <Button type="button" variant="outline" onClick={reload}>
              Try again
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const { items, suggestions, spaces } = state;
  const shown = showAll ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN);

  return (
    <>
      {head}
      {actionError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      <div className={LAYOUT}>
        <StickyEndColumn>
          <PlanOverviewCard
            items={items}
            busy={busy}
            onMove={(item, stage: PlanStage) => void mutate(() => client.updateItem(item.id, { stage }))}
            onAdd={() => setAdding(true)}
          />
        </StickyEndColumn>

        <StickyEndColumn>
          <section aria-labelledby="suggested-heading" className="flex min-w-0 flex-col gap-4">
            <div>
              <h2 id="suggested-heading" className="flex items-center gap-2 text-section text-foreground">
                Suggested for you <CountChip count={suggestions.length} />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Most useful first. Nothing here is required. Add one and it goes into To do.</p>
            </div>
            {suggestions.length === 0 ? (
              <Card className="items-center gap-3 px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
                  <Lightbulb className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-card-title text-foreground">No suggestions yet</h3>
                <p className="text-muted-foreground">No suggestions yet. Take a quiz to get some.</p>
                <Button variant="outline" nativeButton={false} render={<Link href="/spaces" />}>
                  Go to Study Spaces
                </Button>
              </Card>
            ) : (
              <>
                <ul className="flex flex-col gap-4">
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
                  <Button type="button" variant="outline" className="w-fit" onClick={() => setShowAll((value) => !value)}>
                    {showAll ? "Show fewer" : `Show all (${suggestions.length})`}
                  </Button>
                )}
              </>
            )}
          </section>
        </StickyEndColumn>
      </div>

      {adding && (
        <PlanItemDialog open onOpenChange={(next) => !next && setAdding(false)} item={null} spaces={spaces} onSubmit={addOwn} />
      )}
    </>
  );
}
