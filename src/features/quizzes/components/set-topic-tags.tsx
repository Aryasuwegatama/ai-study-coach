"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

/** Tags shown before "+N more". */
const TAGS_SHOWN = 3;

/**
 * A quiz's or deck's topics as tags (UI redesign, Arya, 2026-11-23): the first
 * three, then "+N more", which opens the rest in place so every topic can be
 * checked ("Show fewer" closes it again). Nothing renders with no topics.
 */
export function SetTopicTags({ setId, topics, label }: { setId: string; topics: { id: string; name: string }[]; label: string }) {
  const [showAll, setShowAll] = useState(false);
  if (topics.length === 0) return null;
  const hidden = topics.length - TAGS_SHOWN;
  const listId = `set-${setId}-topics`;

  return (
    <ul id={listId} aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {(showAll ? topics : topics.slice(0, TAGS_SHOWN)).map((topic) => (
        <li key={topic.id}>
          <Badge tone="purple" className="max-w-full whitespace-normal">
            {topic.name}
          </Badge>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls={listId}
            onClick={() => setShowAll((value) => !value)}
            className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-border-strong bg-secondary px-2 py-0.5 text-sm font-medium text-secondary-foreground outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {showAll ? "Show fewer" : `+${hidden} more`}
          </button>
        </li>
      )}
    </ul>
  );
}
