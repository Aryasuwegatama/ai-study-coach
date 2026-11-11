import { Suspense } from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { AppTopBar } from "@/components/app-shell/app-top-bar";
import { SidebarStudySpacesNavSection } from "@/components/app-shell/sidebar-study-spaces-nav-section";
import { SidebarStudySpacesNavSkeleton } from "@/components/app-shell/sidebar-study-spaces-nav-skeleton";
import { SidebarUserMenu } from "@/components/app-shell/sidebar-user-menu";
import { SidebarUserMenuSkeleton } from "@/components/app-shell/sidebar-user-menu-skeleton";
import { SpaceBreadcrumbName } from "@/components/app-shell/space-breadcrumb-name";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The shared shell for every signed-in page (T-04b): sidebar, top bar
 * and content area (Figma node 80:6946). `/dashboard` is the first
 * `(app)` page; later tasks add more under this same layout.
 *
 * Two layers protect every page in this group (T-04b plan):
 * - `src/proxy.ts` (optimistic, cookie-only) redirects a signed-out
 *   visitor before this layout even renders.
 * - Each page's own `getCurrentUser()` read (e.g. the dashboard's
 *   welcome-header section) is the real check — per the Next.js
 *   authentication guide, a layout doesn't control whether the rest of
 *   a route renders, so the check belongs close to the data, not here.
 *
 * No top-level session/cookie read here: that would block the whole
 * shell under Cache Components. Every piece that needs the session
 * (`SidebarUserMenu`; T-05's `SidebarStudySpacesNavSection` and
 * `SpaceBreadcrumbName`) is a small Server Component rendered inside
 * its own `<Suspense>` boundary.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          userMenu={
            <Suspense fallback={<SidebarUserMenuSkeleton />}>
              <SidebarUserMenu />
            </Suspense>
          }
          studySpacesNav={
            <Suspense fallback={<SidebarStudySpacesNavSkeleton />}>
              <SidebarStudySpacesNavSection />
            </Suspense>
          }
        />
        <SidebarInset>
          <AppTopBar
            spaceBreadcrumbName={
              <Suspense fallback={null}>
                <SpaceBreadcrumbName />
              </Suspense>
            }
          />
          <main className="flex flex-1 flex-col">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
