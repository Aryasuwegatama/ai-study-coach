import { redirect } from "next/navigation";

/**
 * T-04a (Arya, 2026-11-07): replaces the Next.js starter page. T-04b
 * gives the app a dashboard to land on, so `/` now redirects there
 * instead of straight to `/sign-in` — a signed-out visitor still ends up
 * on `/sign-in` via `src/proxy.ts`'s optimistic check and, as a second
 * layer, the dashboard page's own `getCurrentUser()` redirect.
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
  redirect("/dashboard");
}
