import { redirect } from "next/navigation";

/**
 * T-04a (Arya, 2026-11-07): replaces the Next.js starter page. There's no
 * dashboard to land on yet (T-04b/T-05), so the only sensible destination
 * for `/` right now is the sign-in screen.
 *
 * `instant = false` opts this segment out of Cache Components' dev-only
 * "instant navigation" validation (node_modules/next/dist/docs/01-app/
 * 02-guides/instant-navigation.md, "Opting out"): a page whose entire job
 * is an unconditional redirect() has no static shell of its own content
 * to validate, and without this the dev overlay logs a spurious
 * "Could not validate `instant`" error on every request to `/` (the
 * `NEXT_REDIRECT` throw it's trying to validate around). Doesn't affect
 * the production build, which already handled this cleanly.
 */
export const instant = false;

export default function Home() {
  redirect("/sign-in");
}
