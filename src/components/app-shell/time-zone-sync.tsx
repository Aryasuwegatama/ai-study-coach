"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Saves the browser's IANA time zone right after sign-in (PRD Section 4).
 * Moved here from T-04a's `SignedInView`, which is retired by this task —
 * this is now the one place in the shell that runs on every signed-in
 * visit, so the effect isn't lost. Renders nothing.
 */
export function TimeZoneSync({ timeZone }: { timeZone: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone && browserTimeZone !== timeZone) {
      void authClient.updateUser({ timeZone: browserTimeZone }).then(() => router.refresh());
    }
  }, [timeZone, router]);

  return null;
}
