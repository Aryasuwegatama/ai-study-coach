import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Re-exposes the (non-secret) Google OAuth client ID to the browser
  // bundle under a second name, so `GOOGLE_OAUTH_CLIENT_ID` stays the one
  // value every developer and Vercel environment actually sets — nobody
  // maintains a NEXT_PUBLIC_ twin by hand. Next loads .env.local before
  // evaluating this file, so `process.env.GOOGLE_OAUTH_CLIENT_ID` here is
  // already populated (see docs/app/api-reference/config/next-config-js/env,
  // "legacy" but still supported — the NEXT_PUBLIC_ prefix only matters
  // for a value read from the environment/.env files directly, not one
  // assigned here).
  env: {
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
