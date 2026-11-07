import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { buildAuthOptions } from "./auth-config";

/**
 * Test-only Better Auth instance, built from the same options as the real
 * app (`buildAuthOptions()` in `./config`) plus Better Auth's `testUtils()`
 * plugin, which exposes privileged helpers (`createUser`, `saveUser`,
 * `deleteUser`, `login`, ...) that create a valid session directly in the
 * database — no real Google sign-in required.
 *
 * Google sign-in cannot be scripted (there is no password to submit), so
 * `scripts/check-auth.ts` is the only caller of this module. It is never
 * imported from `src/app/**`, and this instance deliberately excludes
 * `nextCookies()` (the production instance's plugin for mirroring
 * Set-Cookie into Next's request-scoped `cookies()`): scripts call
 * `.handler()` directly against a plain `Request`/`Response` pair, with no
 * Next.js request context for that plugin to attach to.
 *
 * Per the plugin's own documentation (see
 * node_modules/better-auth/dist/plugins/test-utils/index.d.mts): "Prefer
 * including it in a test-only auth instance ... instead of your production
 * auth config." Keeping `testUtils()` out of `getAuth()` means the
 * production app never exposes `ctx.test`'s session-creation helpers.
 */
export function buildTestAuth() {
  const options = buildAuthOptions();
  return betterAuth({
    ...options,
    plugins: [...options.plugins, testUtils()],
  });
}
