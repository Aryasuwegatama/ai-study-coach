import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic route protection (T-04b plan, Approach step 3): redirects a
 * signed-out visitor to `/sign-in` before any `(app)` page renders.
 *
 * Cookie-only, no database call — per the Next.js proxy docs, this runs
 * on every matched request, including prefetches, so it only checks that
 * a session cookie exists. `getSessionCookie()` uses Better Auth's
 * default cookie prefix, which `src/server/auth/auth-config.ts` never
 * overrides, so this matches what it actually sets on every environment
 * (Production, Preview via the oauth-proxy plugin, and local dev).
 *
 * This is not the real check: a stale or forged cookie passes here. The
 * real check is each page's own `getCurrentUser()` read (see
 * `(app)/dashboard/page.tsx`), plus `requireUser()` on every API route.
 * Don't remove either layer for this one.
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

/**
 * Only the `(app)` paths that exist today. Later tasks extend this list
 * as they add their own protected pages (e.g. T-05 adds
 * `/spaces/:path*`) — never add `/api/auth`, `/sign-in` or `/privacy`.
 */
export const config = {
  matcher: ["/dashboard/:path*"],
};
