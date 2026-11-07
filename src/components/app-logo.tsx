import Image from "next/image";

/**
 * The "AI Study Coach / PERSONAL WORKSPACE" lockup from the Figma header
 * and sidebar (replaces the Figma blue "S" square placeholder with Arya's
 * real logo, added 2026-11-07). Used by the auth layout's glass header
 * today; T-04b's sidebar reuses it, which is why it lives in
 * `src/components/` rather than inside `(auth)/`.
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
        className="size-10 shrink-0"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">AI Study Coach</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Personal workspace
        </span>
      </div>
    </div>
  );
}
