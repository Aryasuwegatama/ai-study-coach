"use client";

import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * Picks this route's space out of the owner-scoped list the server
 * component above passed down, using the URL's own `[spaceId]` segment
 * (plan step 7). Renders the "›" separator and the name together, and
 * nothing at all for a space that isn't in the list: another student's
 * ID or a deleted space's ID shows no name and no trailing "›", the same
 * as `requireSpace()`'s 404 on the Overview page itself.
 */
export function SpaceBreadcrumbNameClient({
  spaces,
}: {
  spaces: { id: string; name: string }[];
}) {
  const params = useParams<{ spaceId?: string }>();
  const space = spaces.find((candidate) => candidate.id === params.spaceId);
  if (!space) return null;
  return (
    <>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate font-medium text-foreground">{space.name}</span>
    </>
  );
}
