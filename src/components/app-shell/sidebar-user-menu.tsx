import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/auth-session";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { TimeZoneSync } from "./time-zone-sync";

/**
 * The sidebar footer's session-reading piece: the real signed-in user's
 * name/email (the account menu) and their time zone (the sync effect).
 * A small Suspense-wrapped Server Component, per the Next.js Cache
 * Components guide ("push dynamic access down") — `app-sidebar.tsx` is a
 * Client Component and can't read the session itself, so the `(app)`
 * layout renders this inside a `<Suspense>` boundary and passes it down
 * as `app-sidebar.tsx`'s `userMenu` prop.
 *
 * Redirects rather than rendering nothing: every `(app)` page already
 * protects itself the same way (`getCurrentUser()` + redirect, per the
 * T-04b plan's two-layer protection), so this is defence in depth, not
 * the only guard.
 */
export async function SidebarUserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <>
      <SidebarAccountMenu name={user.name} email={user.email} />
      <TimeZoneSync timeZone={user.timeZone} />
    </>
  );
}
