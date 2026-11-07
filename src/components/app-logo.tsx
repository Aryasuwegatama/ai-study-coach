import Image from "next/image";

/**
 * The "AI Study Coach / PERSONAL WORKSPACE" lockup from the Figma header
 * and sidebar (replaces the Figma blue "S" square placeholder with Arya's
 * real logo, added 2026-11-07). Used by the auth layout's glass header
 * and (T-04b) the app shell's sidebar, which is why it lives in
 * `src/components/` rather than inside `(auth)/`.
 *
 * The `group-data-[collapsible=icon]` classes only take effect inside a
 * shadcn `Sidebar` that has collapsed to its icon rail (that ancestor
 * sets `data-collapsible="icon"` on the nearest `.group`) — everywhere
 * else, including the `(auth)` glass header, there's no such ancestor,
 * so the lockup renders exactly as before.
 */
export function AppLogo() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/brand/app-logo-transparent.png"
        alt=""
        width={40}
        height={40}
        priority
        className="size-10 shrink-0 group-data-[collapsible=icon]:size-8"
      />
      <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="text-sm font-semibold text-foreground">AI Study Coach</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Personal workspace
        </span>
      </div>
    </div>
  );
}
