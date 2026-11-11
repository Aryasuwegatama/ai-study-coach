import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth/auth-session";
import { listSpaces } from "@/features/spaces/server";
import { SpaceBreadcrumbNameClient } from "./space-breadcrumb-name-client";

/**
 * The top bar's breadcrumb name slot (plan step 7). `src/app/(app)/
 * layout.tsx` sits above the `[spaceId]` segment and can't read the ID
 * itself, so this loads the student's own spaces (never another
 * student's) and hands the list to a small client component that reads
 * the ID from the URL with `useParams()`. No API route for this — the
 * name only ever comes from this owner-scoped, non-deleted list.
 * `connection()` marks this explicitly request-time.
 */
export async function SpaceBreadcrumbName() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const spaces = await listSpaces(user);
  return (
    <SpaceBreadcrumbNameClient spaces={spaces.map((space) => ({ id: space.id, name: space.name }))} />
  );
}
