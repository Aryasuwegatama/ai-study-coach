"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleGlyph } from "@/components/google-glyph";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  state_mismatch: "That sign-in attempt timed out. Please try again.",
  email_not_found: "Google didn't share an email address for this account.",
};
// Shown for any `?error=` value not in the map above, instead of echoing
// the raw value: a crafted link (`?error=<anything>`) could otherwise put
// arbitrary text on the sign-in page.
const GENERIC_ERROR_MESSAGE = "Something went wrong while signing you in. Please try again.";

// Google's Identity Services button only takes a fixed pixel width (no
// percentage/auto), capped at 400. 296px is the largest size that still
// fits the card's content width at a 375px viewport (card max-width 480,
// minus the auth layout's px-4 page padding and the card's own p-6 at
// that breakpoint).
const GSI_BUTTON_WIDTH = 296;

/**
 * Signed-out state: the Figma "Authentication — Sign in" card (node
 * 98:8440), adapted to Google-only sign-in — see the T-04a plan issue for
 * what was dropped (email/password, Forgot password, Create account).
 *
 * One of two buttons, chosen by `supportsIdentityServices` (never both —
 * Arya found two redundant once the nicer one was confirmed working,
 * 2026-11-07):
 * - The Google Identity Services button, rendered into `gsiContainerRef`
 *   when `supportsIdentityServices` is true (Production and local dev —
 *   see `src/server/auth/auth-config.ts`'s `oneTap` comment for why not
 *   Preview). `authClient.oneTap()` loads Google's script, renders the
 *   button and exchanges the resulting ID token for a session itself;
 *   nothing here reads `window.google` directly.
 * - The plain redirect button otherwise — this is Preview's only button
 *   (Identity Services never renders there), styled to match (Figma
 *   secondary pill + Google's "G" mark, which Google's branding
 *   guidelines require on a "Continue with Google" button).
 *
 * Trade-off worth knowing: Production no longer has a visible fallback if
 * the Identity Services button ever fails to render there (e.g. before an
 * Authorized JavaScript origin is added in Google Cloud, or if Google's
 * script is blocked) — before this change the plain button underneath
 * always still worked. Confirmed working before removing it.
 */
export function SignedOutView({
  error,
  supportsIdentityServices,
}: {
  error?: string;
  supportsIdentityServices: boolean;
}) {
  const [pending, setPending] = useState(false);
  const gsiContainerRef = useRef<HTMLDivElement>(null);
  // Guards against React Strict Mode's development-only double-invoke of
  // effects (mount, simulated cleanup, mount again — see
  // https://react.dev/reference/react/StrictMode#fixing-bugs-found-by-re-running-effects-in-development).
  // `authClient.oneTap()` isn't idempotent (it calls Google's
  // `google.accounts.id.initialize()`, which logs a warning and discards
  // the first call if invoked twice), so without this a plain page load
  // in development genuinely called it twice. The ref persists across
  // Strict Mode's synthetic double-run but resets to `false` on a real
  // new mount (e.g. this component remounting after sign-out), so a
  // fresh sign-in still initialises normally.
  const didInitGsiRef = useRef(false);

  useEffect(() => {
    if (!supportsIdentityServices || !gsiContainerRef.current || didInitGsiRef.current) return;
    didInitGsiRef.current = true;
    void authClient
      .oneTap({
        callbackURL: "/dashboard",
        button: {
          container: gsiContainerRef.current,
          config: {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "pill",
            width: GSI_BUTTON_WIDTH,
          },
        },
      })
      .catch((error: unknown) => {
        // The guaranteed-working redirect button below still works, so a
        // failure here (e.g. Google's script blocked or unreachable) only
        // means a missing button, not a broken page. Let a retry happen
        // on the next mount rather than being stuck "already tried".
        didInitGsiRef.current = false;
        console.error("Google Identity Services unavailable", error);
      });
  }, [supportsIdentityServices]);

  async function handleClick() {
    setPending(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in",
    });
  }

  return (
    <div className="flex w-full max-w-[480px] flex-col items-center">
      <Card className="w-full rounded-[20px] p-6 sm:p-12">
        <CardContent className="flex flex-col items-center gap-4 px-0 text-center">
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
              Welcome
            </h1>
            <p className="text-sm leading-[1.375rem] text-muted-foreground">
              Sign in to continue your learning.
            </p>
          </div>

          {error && (
            <Alert className="text-left">
              <AlertTitle>Unable to sign in</AlertTitle>
              <AlertDescription>{ERROR_MESSAGES[error] ?? GENERIC_ERROR_MESSAGE}</AlertDescription>
            </Alert>
          )}

          {supportsIdentityServices ? (
            // Fixed height so the page doesn't jump once Google's script
            // loads and renders its iframe into this container.
            <div ref={gsiContainerRef} className="flex h-11 w-full items-center justify-center" />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleClick}
              disabled={pending}
              className="h-11 w-full gap-2 rounded-full border-border text-primary hover:bg-secondary hover:text-primary"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleGlyph className="size-4" />
              )}
              {pending ? "Redirecting to Google…" : "Continue with Google"}
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 max-w-xs text-center text-xs leading-[1.125rem] text-muted-foreground">
        By continuing, study materials you upload are treated as described in the{" "}
        <Link href="/privacy" className="font-medium text-primary underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
