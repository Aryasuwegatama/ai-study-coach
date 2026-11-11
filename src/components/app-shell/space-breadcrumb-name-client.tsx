"use client";

import { useParams } from "next/navigation";

/**
 * Picks this route's space out of the owner-scoped list the server
 * component above passed down, using the URL's own `[spaceId]` segment
 * (plan step 7). Renders nothing for a space that isn't in the list —
 * another student's ID or a deleted space's ID shows no name, same as
 * `requireSpace()`'s 404 on the Overview page itself.
 */
export function SpaceBreadcrumbNameClient({
  spaces,
}: {
  spaces: { id: string; name: string }[];
}) {
  const params = useParams<{ spaceId?: string }>();
  const space = spaces.find((candidate) => candidate.id === params.spaceId);
  if (!space) return null;
  return <>{space.name}</>;
}
