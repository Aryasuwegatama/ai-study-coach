import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth-config";

/**
 * Mounts every Better Auth endpoint (sign-up, sign-in, sign-out, session,
 * etc.) at /api/auth/*. `getAuth()` is called lazily, inside the request
 * handler, not at module scope — see config.ts for why.
 */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler((request) =>
  getAuth().handler(request),
);
