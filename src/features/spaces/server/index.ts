// Other features import Study Spaces only through this barrel (PRD
// Section 4 module rule: "a feature may import another feature only
// through its server/index.ts"). `requireSpace()` itself is a shared
// server adapter, not spaces-internal — later features import it
// directly from `@/server/auth/auth-space-access`, the same way every
// feature already imports `requireUser()`.
export { listSpaces, listSpaceSummaries, getSpaceCounts, createSpace, renameSpace, deleteSpace } from "./spaces-service";
export type { SpaceCounts, SpaceResponse, SpaceSummary } from "../spaces-schemas";
