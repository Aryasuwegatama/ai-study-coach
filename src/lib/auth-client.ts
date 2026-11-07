"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, oneTapClient } from "better-auth/client/plugins";
import type { Auth } from "@/server/auth/auth-config";

/**
 * The Google OAuth client's public ID — not a secret; it's already visible
 * in every plain sign-in redirect's URL and in the Identity Services
 * button's own HTML. There is no separate `NEXT_PUBLIC_...` value to set
 * anywhere: `next.config.ts` re-exposes the one real `GOOGLE_OAUTH_CLIENT_ID`
 * secret (validated in `src/lib/server-env.ts`) to the browser bundle under this
 * name at build time, so this is always the same value as the server's.
 * Falls back to an empty string so this module never throws just from
 * being imported on an environment that hasn't set it (Preview never
 * calls `authClient.oneTap()` — see sign-in-view.tsx) — only an actual
 * `oneTap()` call there would fail, which never happens.
 */
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? "";

/**
 * Browser-side Better Auth client. Only the bare sign-in page (T-01c) uses
 * this today — the Google button(s), sign-out and the one-shot time-zone
 * sync. `baseURL` is left unset: it defaults to the current origin, which
 * is correct on localhost, every Vercel preview and Production alike.
 *
 * `inferAdditionalFields<Auth>()` is a type-only link to the server's
 * exact `additionalFields` (`@/server/auth/config`'s `Auth` type, never
 * its value) — without it `updateUser()` only knows the base `name`/
 * `image` fields and rejects `timeZone` at compile time.
 *
 * `oneTapClient()` is always included (even where `googleClientId` is
 * empty) so `authClient.oneTap` keeps its real, typed signature rather
 * than widening to `any` from a conditionally-included plugin — see the
 * `satisfies`/inference note in `@/server/auth/config`'s
 * `buildAuthOptions()` for the same class of problem. It only matters at
 * runtime if `.oneTap()` is actually called, which sign-in-view.tsx gates
 * on the server-computed `supportsIdentityServices` flag.
 */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<Auth>(),
    oneTapClient({
      clientId: googleClientId,
      promptOptions: {
        // The plugin's default (true) calls `navigator.credentials.
        // preventSilentAccess()` on every sign-out, unguarded, to clear
        // FedCM's silent-mediation state — the browser's Credential
        // Management service rejects that call with `NotSupportedError`
        // in practice, surfacing as an unhandled rejection. That state
        // only matters for Google's *automatic* One Tap prompt (silent
        // re-sign-in without asking), which this app never uses — the
        // sign-in page only renders an explicit button
        // (sign-in-view.tsx's `button: {...}` option), so there is
        // nothing here for that silent state to affect.
        fedCM: false,
      },
    }),
  ],
});
