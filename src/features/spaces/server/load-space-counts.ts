import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth/auth-session";
import { getSpaceCounts } from "./spaces-service";

/**
 * The space banner and the tabs both show counts, and they render in the
 * same request, so this reads them once (`cache` de-duplicates within a
 * render). Same session check as every page that renders them.
 */
export const loadSpaceCounts = cache(async (spaceId: string) => {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return getSpaceCounts(user, spaceId);
});
