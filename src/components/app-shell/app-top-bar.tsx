"use client";

import { Suspense } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Grows as later tasks add `(app)` pages — each adds its own breadcrumb
 * label here rather than inventing a second breadcrumb mechanism.
 */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/spaces": "My Study Spaces",
};

const SPACE_SUBPAGE_PATTERN = /^\/spaces\/[^/]+\/(?:overview|materials)(?:\/.*)?$/;

/**
 * The shared app shell's top bar (Figma node 80:6946, "Single
 * contextual top bar"): a sidebar toggle, then a breadcrumb. The Figma
 * design's notification bell is left out here — its data comes from the
 * `jobs` table, a later backend task (T-04b plan: "leave out the
 * notification bell").
 *
 * T-05 adds the Study Space breadcrumb ("My workspace › My Study Spaces
 * › {name}"), shown on Overview and (T-09a) Materials:
 * `spaceBreadcrumbName` is a Suspense-wrapped server slot (same pattern
 * as `userMenu`) that resolves the current space's name — see
 * `space-breadcrumb-name.tsx`.
 */
export function AppTopBar({ spaceBreadcrumbName }: { spaceBreadcrumbName: ReactNode }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-[#ffffffe6] bg-[#f4f7fcd1] px-6 shadow-[0_2px_24px_#263b5c09] backdrop-blur-[32px] sm:px-10">
      <SidebarTrigger />
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Link href="/dashboard" className="shrink-0 font-medium text-primary">
          My workspace
        </Link>
        {/* usePathname() needs runtime URL data; isolated here so a
            dynamic route (/spaces/[spaceId]) doesn't block the rest of
            this shared top bar's static shell. */}
        <Suspense fallback={<BreadcrumbTrailFallback />}>
          <BreadcrumbTrail spaceBreadcrumbName={spaceBreadcrumbName} />
        </Suspense>
      </nav>
    </header>
  );
}

function BreadcrumbTrail({ spaceBreadcrumbName }: { spaceBreadcrumbName: ReactNode }) {
  const pathname = usePathname();
  const isSpaceSubpage = SPACE_SUBPAGE_PATTERN.test(pathname);

  if (isSpaceSubpage) {
    return (
      <>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Link href="/spaces" className="shrink-0 font-medium text-primary">
          My Study Spaces
        </Link>
        {/* Renders its own "›" and the name together, or nothing at all
            (while loading, or for a space that isn't found), so the
            trail never ends in a stray "›". */}
        {spaceBreadcrumbName}
      </>
    );
  }

  return (
    <>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate font-medium text-foreground">
        {ROUTE_LABELS[pathname] ?? "Dashboard"}
      </span>
    </>
  );
}

function BreadcrumbTrailFallback() {
  return (
    <>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Skeleton className="h-4 w-24" />
    </>
  );
}
