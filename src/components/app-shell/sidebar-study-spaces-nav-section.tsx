import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaces } from "@/features/spaces/server";
import { SidebarStudySpacesNav } from "./sidebar-study-spaces-nav";

/**
 * The sidebar's session-reading piece for Study Spaces — same pattern as
 * `sidebar-user-menu.tsx`: a small Suspense-wrapped Server Component the
 * `(app)` layout renders and passes down as `AppSidebar`'s
 * `studySpacesNav` prop, since `app-sidebar.tsx` is a Client Component
 * and can't read the session itself. `connection()` marks this
 * explicitly request-time (always the live, per-student list).
 */
export async function SidebarStudySpacesNavSection() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const spaces = await listSpaces(user);
  return <SidebarStudySpacesNav spaces={spaces} />;
}
