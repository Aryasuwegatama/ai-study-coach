"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Grows as later tasks add `(app)` pages — each adds its own breadcrumb
 * label here rather than inventing a second breadcrumb mechanism.
 */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
};

/**
 * The shared app shell's top bar (Figma node 80:6946, "Single
 * contextual top bar"): a sidebar toggle, then a breadcrumb. The Figma
 * design's notification bell is left out here — its data comes from the
 * `jobs` table, a later backend task (T-04b plan: "leave out the
 * notification bell").
 */
export function AppTopBar() {
  const pathname = usePathname();
  const label = ROUTE_LABELS[pathname] ?? "Dashboard";

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-[#ffffffe6] bg-[#f4f7fcd1] px-6 shadow-[0_2px_24px_#263b5c09] backdrop-blur-[32px] sm:px-10">
      <SidebarTrigger />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="font-medium text-primary">
          My workspace
        </Link>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium text-foreground">{label}</span>
      </nav>
    </header>
  );
}
