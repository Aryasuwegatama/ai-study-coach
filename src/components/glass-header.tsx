import { AppLogo } from "@/components/app-logo";

/**
 * The 72px header on Sign in and Privacy. Same cream surface and soft
 * bottom line as the app's top bar (UI redesign: the earlier blue-grey
 * "glass" colours from Figma are gone). A plain component rather than part
 * of `(auth)/layout.tsx` so `/privacy` (a sibling route outside the
 * `(auth)` group) can render the same header without duplicating its markup.
 */
export function GlassHeader() {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-card px-6 sm:px-10">
      <AppLogo />
      <span className="hidden text-sm text-muted-foreground sm:block">
        Your learning, your space.
      </span>
    </header>
  );
}
