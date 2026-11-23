"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, FolderOpen, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { SpaceMonogram } from "@/features/spaces/components/space-monogram";
import { cn } from "@/lib/class-names";
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";

/**
 * "Study Spaces" nav item: the expandable disclosure in the expanded
 * sidebar (Figma node 80:6946) and the flyout from the collapsed icon
 * rail (Figma node 27:720). T-05 replaces the `dashboard-sample-spaces`
 * fixture this used to read with the student's real spaces, passed down
 * from `sidebar-study-spaces-nav-section.tsx` (the `studySpacesNav` slot
 * — same pattern as `userMenu`). Every space and the "+" action now link
 * somewhere real instead of being disabled.
 */
const SPACE_ID_PATTERN = /^\/spaces\/([^/]+)\/overview(?:\/.*)?$/;

export function SidebarStudySpacesNav({ spaces }: { spaces: SpaceResponse[] }) {
  const { state, isMobile } = useSidebar();
  const [expanded, setExpanded] = useState(true);
  const collapsedRail = state === "collapsed" && !isMobile;
  const pathname = usePathname();
  const activeSpaceId = pathname.match(SPACE_ID_PATTERN)?.[1];
  // Active on the Study Spaces list page itself; on a space's own pages that space's row is active instead.
  const onSpacesPage = pathname === "/spaces";

  if (collapsedRail) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton tooltip="Study Spaces" isActive={onSpacesPage} />}>
            <FolderOpen />
            <span>Study Spaces</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-56">
            {/* Base UI's `Menu.GroupLabel` (what `DropdownMenuLabel`
                wraps) throws at runtime unless it's inside a
                `Menu.Group` — see the same fix in sidebar-account-menu. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Study Spaces</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/spaces" />}>
              Open Study Spaces
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {spaces.length === 0 ? (
              <DropdownMenuItem disabled className="gap-2">
                No study spaces yet
              </DropdownMenuItem>
            ) : (
              spaces.map((space) => (
                <DropdownMenuItem
                  key={space.id}
                  className="gap-2"
                  aria-current={space.id === activeSpaceId ? "page" : undefined}
                  render={<Link href={`/spaces/${space.id}/overview`} />}
                >
                  <SpaceMonogram id={space.id} name={space.name} className="size-5 text-[10px]" />
                  <span className="truncate">{space.name}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" render={<Link href="/spaces?create=1" />}>
              <Plus className="size-4" aria-hidden="true" />
              Create study space
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      {/* The whole row (link, chevron and "+") is one highlight, like the
          other menu items: hover and the active state live on the row, and
          the link inside stays transparent. The link keeps the standard left
          padding so its icon lines up with Dashboard; only its right padding
          shrinks, which leaves "Study Spaces" room in the 15rem sidebar. */}
      <div
        className={cn(
          "flex w-full items-center gap-0.5 rounded-sm pr-1 text-sidebar-foreground hover:bg-surface-hover",
          onSpacesPage &&
            "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)] hover:bg-sidebar-accent",
        )}
      >
        <SidebarMenuButton
          render={<Link href="/spaces" aria-current={onSpacesPage ? "page" : undefined} />}
          className={cn(
            "min-w-0 flex-1 pr-1 hover:bg-transparent active:bg-transparent",
            onSpacesPage && "font-semibold text-sidebar-accent-foreground",
          )}
        >
          <FolderOpen />
          <span>Study Spaces</span>
        </SidebarMenuButton>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse Study Spaces" : "Expand Study Spaces"}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-current outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <ChevronRight
            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </button>
        <Link
          href="/spaces?create=1"
          aria-label="Create study space"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-current outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {expanded && (
        <SidebarMenuSub className="mx-2 px-2">
          {spaces.length === 0 ? (
            <SidebarMenuSubItem>
              <span className="px-2 py-1.5 text-xs text-muted-foreground">
                No study spaces yet
              </span>
            </SidebarMenuSubItem>
          ) : (
            spaces.map((space) => (
              <SidebarMenuSubItem key={space.id}>
                {/* Long space names wrap onto a second line instead of
                    being cut off (the base sub-button truncates its last span). */}
                <SidebarMenuSubButton
                  className="h-auto min-h-10 gap-2 py-2 leading-snug [&>span:last-child]:break-words [&>span:last-child]:whitespace-normal!"
                  isActive={space.id === activeSpaceId}
                  render={<Link href={`/spaces/${space.id}/overview`} />}
                >
                  <SpaceMonogram id={space.id} name={space.name} className="size-5 text-[10px]" />
                  <span className="min-w-0">{space.name}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))
          )}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
