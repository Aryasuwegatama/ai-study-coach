import type { MaterialWithSize } from "../client/materials-client";

/**
 * The example library's internal row shape (sample-data rule:
 * `docs/CONTRIBUTING.md`, "File naming"). `forceDeleteFailure` only
 * exists here, never in `MaterialWithSize` or any API response — it is
 * how `materials-sample-library.ts` marks the one row that always fails
 * to delete, so the delete-failed state (`MATERIAL_DELETE_FAILED`, which
 * T-06b adds) can be demonstrated before the real error exists.
 */
export type MaterialExample = MaterialWithSize & {
  forceDeleteFailure?: boolean;
};
