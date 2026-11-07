"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  state_mismatch: "That sign-in attempt timed out. Please try again.",
  email_not_found: "Google didn't share an email address for this account.",
};

/**
 * Signed-out state (T-01c scope — deliberately bare; T-04a styles this).
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
 *   (Identity Services never renders there), and it's the same button
 *   T-01c originally shipped with, with `check:auth` coverage.
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
        callbackURL: "/sign-in",
        button: {
          container: gsiContainerRef.current,
          config: { type: "standard", theme: "outline", size: "large", text: "continue_with" },
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
      callbackURL: "/sign-in",
      errorCallbackURL: "/sign-in",
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {supportsIdentityServices ? (
        <div ref={gsiContainerRef} />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Redirecting to Google…" : "Continue with Google"}
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-xs text-center text-sm text-red-600 dark:text-red-400">
          {ERROR_MESSAGES[error] ?? `Sign-in failed: ${error}`}
        </p>
      )}
      <p className="max-w-xs text-center text-xs text-zinc-500 dark:text-zinc-400">
        By continuing, study materials you upload are treated as described in
        the <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
    </div>
  );
}

/**
 * Signed-in state: who you are, and a way to sign out. Also sends the
 * browser's IANA time zone once, the first time it's missing or different
 * from what's stored (PRD Section 4: saved right after sign-in).
 */
export function SignedInView({
  name,
  email,
  timeZone,
}: {
  name: string;
  email: string;
  timeZone: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone && browserTimeZone !== timeZone) {
      void authClient
        .updateUser({ timeZone: browserTimeZone })
        .then(() => router.refresh());
    }
  }, [timeZone, router]);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-lg font-medium">{name}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Time zone: {timeZone ?? "not set yet"}
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-4 rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Sign out
      </button>
    </div>
  );
}
