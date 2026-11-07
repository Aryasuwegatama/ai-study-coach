"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
import { SidebarStudySpacesNav } from "./sidebar-study-spaces-nav";

/**
 * The shared app shell's sidebar (Figma node 80:6946, "Liquid Glass
 * sidebar · expanded"; collapsed rail, node 27:438). Nav items for
 * screens that don't exist yet are shown but disabled rather than
 * linking to a 404 — each later task enables its own item (T-04b plan).
 *
 * `userMenu` is rendered, not read here: it's a Server Component built
 * by the `(app)` layout from inside its own `<Suspense>` boundary (a
 * Client Component can't import an async Server Component directly, but
 * it can render one passed in as a prop).
 */
export function AppSidebar({ userMenu }: { userMenu: ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 py-3">
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive tooltip="Dashboard" render={<Link href="/dashboard" />}>
                <LayoutDashboard />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarStudySpacesNav />

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
