"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * Picks this route's space out of the owner-scoped list the server
 * component above passed down, using the URL's own `[spaceId]` segment
 * (plan step 7). Renders the "›" separators and the names together, and
 * nothing at all for a space that isn't in the list: another student's
 * ID or a deleted space's ID shows no name and no trailing "›", the same
 * as `requireSpace()`'s 404 on the Overview page itself.
 *
 * The space name links to its Overview, except on the Overview itself,
 * where it is the current page. On the Confirm topics page the trail
 * continues "… › {space} › Materials › Confirm topics".
 */
const CONFIRM_TOPICS_PATTERN = /^\/spaces\/[^/]+\/materials\/[^/]+\/topics\/?$/;
const OVERVIEW_PATTERN = /^\/spaces\/[^/]+\/overview\/?$/;

export function SpaceBreadcrumbNameClient({
  spaces,
}: {
  spaces: { id: string; name: string }[];
}) {
  const params = useParams<{ spaceId?: string }>();
  const pathname = usePathname();
  const space = spaces.find((candidate) => candidate.id === params.spaceId);
  if (!space) return null;

  const onConfirmTopics = CONFIRM_TOPICS_PATTERN.test(pathname);
  const onOverview = OVERVIEW_PATTERN.test(pathname);

  return (
    <>
      <Separator />
      {onOverview ? (
        <span aria-current="page" className="min-w-0 truncate font-semibold text-foreground">
          {space.name}
        </span>
      ) : (
        <Link
          href={`/spaces/${space.id}/overview`}
          className="min-w-0 truncate text-muted-foreground hover:underline"
        >
          {space.name}
        </Link>
      )}
      {onConfirmTopics && (
        <>
          <Separator />
          <Link
            href={`/spaces/${space.id}/materials`}
            className="shrink-0 text-muted-foreground hover:underline"
          >
            Materials
          </Link>
          <Separator />
          <span aria-current="page" className="shrink-0 font-semibold text-foreground">
            Confirm topics
          </span>
        </>
      )}
    </>
  );
}

function Separator() {
  return <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}
