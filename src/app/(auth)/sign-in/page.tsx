import { Suspense } from "react";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/server-env";
import { getCurrentUser } from "@/server/auth/auth-session";
import { SignInCardSkeleton } from "./sign-in-card-skeleton";
import { SignedOutView } from "./sign-in-view";

/**
 * Styled Google-only sign-in screen (T-04a; replaces the bare T-01c page).
 * The glass header and centred layout live in `(auth)/layout.tsx`; this
 * page renders only the card itself. Signed out: a Google Identity
 * Services button where supported, plus the plain "Continue with Google"
 * redirect button (always present — see sign-in-view.tsx).
 *
 * Signed in: redirects to `/dashboard` (T-04b) rather than rendering a
 * card here — this retires T-04a's `SignedInView`, which this screen no
 * longer needs now that there's somewhere to land after sign-in.
 *
 * Reads the session, so (per node_modules/next/dist/docs/01-app/02-guides/
 * authentication-with-cache-components.md) it sits behind a `<Suspense>`
 * boundary rather than at the page's top level.
 */
export default function SignInPage(props: PageProps<"/sign-in">) {
  // A plain env read, not per-request data, so (unlike the session below)
  // this doesn't need to be behind the Suspense boundary.
  const supportsIdentityServices = serverEnv().VERCEL_ENV !== "preview";

  return (
    <Suspense fallback={<SignInCardSkeleton />}>
      <SignInStatus
        searchParams={props.searchParams}
        supportsIdentityServices={supportsIdentityServices}
      />
    </Suspense>
  );
}

async function SignInStatus({
  searchParams,
  supportsIdentityServices,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
  supportsIdentityServices: boolean;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const error = typeof params.error === "string" ? params.error : undefined;

  if (user) {
    redirect("/dashboard");
  }
  return <SignedOutView error={error} supportsIdentityServices={supportsIdentityServices} />;
}
