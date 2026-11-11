"use client";

import { Suspense } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, TrendingUp } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * The shared app shell's sidebar (Figma node 80:6946, "Liquid Glass
 * sidebar · expanded"; collapsed rail, node 27:438). Nav items for
 * screens that don't exist yet are shown but disabled rather than
 * linking to a 404 — each later task enables its own item (T-04b plan).
 *
 * `userMenu` and `studySpacesNav` are rendered, not read here: both are
 * Server Components built by the `(app)` layout from inside their own
 * `<Suspense>` boundary (a Client Component can't import an async
 * Server Component directly, but it can render one passed in as a
 * prop) — `studySpacesNav` is T-05's real `SidebarStudySpacesNav`,
 * replacing the disabled fixture-backed one T-04b shipped.
 */
export function AppSidebar({
  userMenu,
  studySpacesNav,
}: {
  userMenu: ReactNode;
  studySpacesNav: ReactNode;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 py-3">
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* usePathname() needs runtime URL data; isolated into its
                  own Suspense boundary so a dynamic route (/spaces/[spaceId])
                  elsewhere in the shell doesn't block this whole sidebar's
                  static shell — see DashboardNavButtonFallback. */}
              <Suspense fallback={<DashboardNavButtonFallback />}>
                <DashboardNavButton />
              </Suspense>
            </SidebarMenuItem>

            {studySpacesNav}

            <SidebarMenuItem>
              <SidebarMenuButton disabled aria-disabled="true" tooltip="My Progress">
                <TrendingUp />
                <span>My Progress</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton disabled aria-disabled="true" tooltip="My Revision">
                <History />
                <span>My Revision</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>{userMenu}</SidebarFooter>
    </Sidebar>
  );
}

function DashboardNavButton() {
  const pathname = usePathname();
  return (
    <SidebarMenuButton
      isActive={pathname === "/dashboard"}
      tooltip="Dashboard"
      render={<Link href="/dashboard" />}
    >
      <LayoutDashboard />
      <span>Dashboard</span>
    </SidebarMenuButton>
  );
}

/** Same markup without the active state, which needs the runtime pathname. */
function DashboardNavButtonFallback() {
  return (
    <SidebarMenuButton tooltip="Dashboard" render={<Link href="/dashboard" />}>
      <LayoutDashboard />
      <span>Dashboard</span>
    </SidebarMenuButton>
  );
}
