import Link from "next/link";
import { CalendarDays, Folder } from "lucide-react";
import type { PlanItemResponse } from "../plan-schemas";
import { formatPlannedOn } from "../plan-format";

/**
 * A plan item's Study Space and day, each led by its own icon (no dot
 * separators, which dangle when the line wraps). The day is the plain date
 * the student picked, or "Anytime": never red, never "overdue".
 */
export function PlanItemMeta({ item }: { item: Pick<PlanItemResponse, "spaceName" | "plannedOn"> }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
      {item.spaceName && (
        <span className="inline-flex items-center gap-1">
          <Folder className="size-4 shrink-0" aria-hidden="true" />
          {item.spaceName}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
        {item.plannedOn ? `Planned for ${formatPlannedOn(item.plannedOn)}` : "Anytime"}
      </span>
    </p>
  );
}

/** The item's title: a link while it's open and its target still exists, plain text otherwise. */
export function PlanItemTitle({ item, id }: { item: Pick<PlanItemResponse, "title" | "href" | "stage">; id: string }) {
  if (item.href && item.stage !== "done") {
    return (
      <Link id={id} href={item.href} className="block font-semibold break-words text-primary underline underline-offset-4 hover:text-primary-hover">
        {item.title}
      </Link>
    );
  }
  return (
    <span id={id} className={item.stage === "done" ? "block font-semibold break-words text-muted-foreground line-through" : "block font-semibold break-words text-foreground"}>
      {item.title}
    </span>
  );
}
