import { headers as nextHeaders } from "next/headers";
import { cacheLife } from "next/cache";
import { ApiError } from "@/lib/errors";
import { getAuth } from "./config";

/**
 * The narrow user shape every caller gets. Not the raw Better Auth session
 * object — callers never see fields they don't need.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  timeZone: string | null;
};

function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  timeZone?: string | null;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    timeZone: user.timeZone ?? null,
  };
}

/**
 * Request flow step 2 (PRD Section 4): "`requireUser()` returns the
 * signed-in user or responds 401." This reads the session from the
 * request's own cookies, so it works in Route Handlers and Server Actions
 * without the Suspense / `use cache: private` machinery `getCurrentUser()`
 * needs for page rendering (see that function for why).
 *
 * Throws `ApiError` on a missing/invalid session; callers catch it with
 * `toErrorResponse()`:
 *
 *   try {
 *     const user = await requireUser();
 *     ...
 *   } catch (error) {
 *     return toErrorResponse(error);
 *   }
 *
 * Identity always comes from this session lookup, never from the request
 * body (Security rule 1) — callers must not accept a client-supplied user
 * ID in its place.
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    throw new ApiError("UNAUTHORIZED", "Sign in required.", 401);
  }
  return toSessionUser(session.user);
}

/**
 * Nullable session read for Server Components (no page uses this yet —
 * T-04c+ builds the first ones). Returns `null` when signed out instead of
 * throwing, so a component can render different UI either way rather than
 * forcing a redirect.
 *
 * Needs `'use cache: private'`, not the plain React `cache()` memoisation
 * `requireUser()` doesn't need: this project has `cacheComponents: true`
 * (next.config.ts), and under Cache Components a Server Component that
 * reads `cookies()`/`headers()` directly must sit behind a Suspense
 * boundary and can't be part of the prerendered static shell. Wrapping the
 * read in `'use cache: private'` is Next's documented pattern for exactly
 * this (see node_modules/next/dist/docs/01-app/02-guides/
 * authentication-with-cache-components.md, "Step 1: Read the current
 * user"): the function still reads live, per-request cookies, it's just
 * now a private cache scope the framework can schedule and prefetch
 * around. `stale: Infinity` keeps it from shortening the route's overall
 * client-cache lifetime — this call only needs request-scoped
 * deduplication, not a real cache lifetime.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  "use cache: private";
  cacheLife({ stale: Infinity });

  const session = await getAuth().api.getSession({ headers: await nextHeaders() });
  return session ? toSessionUser(session.user) : null;
}
