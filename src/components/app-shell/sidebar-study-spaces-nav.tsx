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
import type { SpaceResponse } from "@/features/spaces/spaces-schemas";

/**
 * "My Study Spaces" nav item: the expandable disclosure in the expanded
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

  if (collapsedRail) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton tooltip="My Study Spaces" />}>
            <FolderOpen />
            <span>My Study Spaces</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-56">
            {/* Base UI's `Menu.GroupLabel` (what `DropdownMenuLabel`
                wraps) throws at runtime unless it's inside a
                `Menu.Group` — see the same fix in sidebar-account-menu. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>My Study Spaces</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/spaces" />}>
              Open My Study Spaces
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
              New study space
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <div className="flex w-full items-center gap-1">
        <SidebarMenuButton render={<Link href="/spaces" />} className="flex-1">
          <FolderOpen />
          <span>My Study Spaces</span>
        </SidebarMenuButton>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse My Study Spaces" : "Expand My Study Spaces"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronRight
            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </button>
        <Link
          href="/spaces?create=1"
          aria-label="New study space"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {expanded && (
        <SidebarMenuSub>
          {spaces.length === 0 ? (
            <SidebarMenuSubItem>
              <span className="px-2 py-1.5 text-xs text-muted-foreground">
                No study spaces yet
              </span>
            </SidebarMenuSubItem>
          ) : (
            spaces.map((space) => (
              <SidebarMenuSubItem key={space.id}>
                <SidebarMenuSubButton
                  className="gap-2"
                  isActive={space.id === activeSpaceId}
                  render={<Link href={`/spaces/${space.id}/overview`} />}
                >
                  <SpaceMonogram id={space.id} name={space.name} className="size-5 text-[10px]" />
                  <span className="truncate">{space.name}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))
          )}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
