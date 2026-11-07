"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Loader2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

function initialsOf(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

/**
 * The sidebar's account menu (Figma node 101:9083, "Account / Sidebar
 * menu"): name, "Student account", Sign out. Drops "Account settings"
 * from the Figma design — no settings page exists yet (T-04b plan).
 *
 * Sign out keeps T-04a's `SignedInView` behaviour: spinner, "Signing
 * out…", disabled while pending. `closeOnClick={false}` on that item
 * keeps the menu open (so the spinner stays visible) instead of the
 * default close-on-select — the menu disappears anyway once the
 * redirect lands on `/sign-in`, which unmounts this whole shell.
 */
export function SidebarAccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">
          {initialsOf(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate text-sm font-medium text-sidebar-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">Student account</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-60">
        {/* Base UI's `Menu.GroupLabel` (what `DropdownMenuLabel` wraps)
            throws at runtime unless it's inside a `Menu.Group` — this
            label has no associated items, so the group just exists to
            satisfy that requirement. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-medium text-foreground">{name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={signingOut} closeOnClick={false}>
          {signingOut ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-4" aria-hidden="true" />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
