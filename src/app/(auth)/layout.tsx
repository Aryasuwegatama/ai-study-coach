import type { ReactNode } from "react";
import { GlassHeader } from "@/components/glass-header";

/**
 * Shared chrome for every `(auth)` screen: the glass header, then centred
 * content on the canvas background. Today only `sign-in` sits in this
 * group; Profile and Security (not built in T-04a) will join it later.
 *
 * Plain `{ children: ReactNode }` rather than a generated `LayoutProps<...>`
 * — route-group layouts like this one (no dynamic segments) don't need
 * Next's typed-route helper, and this group may cover more than one route
 * once Profile/Security exist.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <GlassHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        {children}
      </main>
    </div>
  );
}
