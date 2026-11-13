// Better Auth tables (T-01b). Generated, not hand-written — re-run
// `pnpm run auth:generate` after changing the auth config in
// src/server/auth/auth-config.ts, never edit auth.ts by hand.
export * from "./auth";

// Domain tables land here feature by feature (T-05 onward), owned by
// whichever task adds them per the PRD ownership boundary (Section 5).
export * from "./study-spaces";
export * from "./materials";
export * from "./chunks";
export * from "./jobs";
export * from "./topics";
export * from "./ai-calls";
export * from "./study-sets";
export * from "./attempts";
