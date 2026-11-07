import { AppLogo } from "@/components/app-logo";

/**
 * The 72px "glass" header from the Figma Authentication — Sign in screen
 * (node 98:8440, "Glass authentication header") and the reusable-UI sheet
 * (node 11:2). A plain component rather than part of `(auth)/layout.tsx`
 * so `/privacy` (a sibling route outside the `(auth)` group) can render
 * the same header without duplicating its markup.
 */
export function GlassHeader() {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#ffffffe6] bg-[#f4f7fcd1] px-6 shadow-[0_2px_24px_#263b5c09] backdrop-blur-[32px] sm:px-10">
      <AppLogo />
      <span className="hidden text-sm text-muted-foreground sm:block">
        Your learning, your space.
      </span>
    </header>
  );
}
