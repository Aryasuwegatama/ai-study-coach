"use client";

import { useState } from "react";
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
import { dashboardSampleSpaces } from "@/features/dashboard/fixtures/dashboard-sample-spaces";
import type { DashboardSampleSpaceTone } from "@/features/dashboard/fixtures/dashboard-sample-types";

const TONE_CLASSES: Record<DashboardSampleSpaceTone, string> = {
  blue: "bg-secondary text-primary",
  purple: "bg-soft-purple text-purple",
  green: "bg-soft-green text-green",
};

function SpaceMonogram({ name, tone }: { name: string; tone: DashboardSampleSpaceTone }) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${TONE_CLASSES[tone]}`}
      aria-hidden="true"
    >
      {name.charAt(0)}
    </span>
  );
}

/**
 * "My Study Spaces" nav item: the expandable disclosure in the expanded
 * sidebar (Figma node 80:6946, "My Study Spaces · expandable group") and
 * the flyout from the collapsed icon rail (Figma node 27:720). Reads the
 * same `dashboard-sample-spaces.ts` fixture the Dashboard's space cards
 * use, so the list always matches. Every space and the "+" action are
 * disabled — Study Spaces don't exist yet (T-05 enables this item).
 */
export function SidebarStudySpacesNav() {
  const { state, isMobile } = useSidebar();
  const [expanded, setExpanded] = useState(true);
  const collapsedRail = state === "collapsed" && !isMobile;

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
            <DropdownMenuSeparator />
            {dashboardSampleSpaces.map((space) => (
              <DropdownMenuItem key={space.id} disabled className="gap-2">
                <SpaceMonogram name={space.name} tone={space.tone} />
                {space.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="gap-2">
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
        <SidebarMenuButton
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex-1"
        >
          <FolderOpen />
          <span>My Study Spaces</span>
          <ChevronRight
            className={`ml-auto size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </SidebarMenuButton>
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="New study space"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <SidebarMenuSub>
          {dashboardSampleSpaces.map((space) => (
            <SidebarMenuSubItem key={space.id}>
              <SidebarMenuSubButton aria-disabled="true" tabIndex={-1} className="gap-2">
                <SpaceMonogram name={space.name} tone={space.tone} />
                {space.name}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
