import { MATERIAL_FAILURE_REASONS } from "../materials-schemas";
import type { MaterialExample } from "./materials-sample-types";

/**
 * Flip to `true` locally to preview the Figma empty state (node 47:18192)
 * — the acceptance criteria's "a toggle in the fixtures". Never commit
 * it as `true`.
 */
export const MATERIALS_SAMPLE_EMPTY = false;

/**
 * About six example materials (plan step 3), typed as `MaterialResponse`
 * plus `sizeBytes`, covering every status: `uploading`, `processing` with
 * known progress, `review_topics`, `ready`, and `failed` with a real
 * `MATERIAL_FAILURE_REASONS` reason. One `ready` row carries
 * `forceDeleteFailure` so the delete-failed state can be shown on demand.
 * `example-materials-client.ts` copies this array into its own mutable
 * state rather than mutating it directly.
 */
export const materialsSampleLibrary: MaterialExample[] = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    originalName: "Week 3 — Research Methods.pdf",
    status: "ready",
    stage: "suggest_topics",
    progress: null,
    error: null,
    pageCount: 18,
    sizeBytes: 1_850_000,
    createdAt: "2026-11-09T02:15:00.000Z",
    updatedAt: "2026-11-09T02:18:40.000Z",
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    originalName: "Lecture 5 Slides.pptx",
    status: "processing",
    stage: "embed",
    progress: { done: 120, total: 300 },
    error: null,
    pageCount: 54,
    sizeBytes: 6_200_000,
    createdAt: "2026-11-12T22:40:00.000Z",
    updatedAt: "2026-11-12T22:41:12.000Z",
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    originalName: "Chapter 4 Notes.txt",
    status: "review_topics",
    stage: "suggest_topics",
    progress: null,
    error: null,
    pageCount: 9,
    sizeBytes: 42_000,
    createdAt: "2026-11-11T09:05:00.000Z",
    updatedAt: "2026-11-11T09:07:30.000Z",
  },
  {
    id: "a4444444-4444-4444-8444-444444444444",
    originalName: "Chapter 6 Draft.pdf",
    status: "uploading",
    stage: null,
    progress: null,
    error: null,
    pageCount: null,
    sizeBytes: 3_100_000,
    createdAt: "2026-11-13T01:02:00.000Z",
    updatedAt: "2026-11-13T01:02:00.000Z",
  },
  {
    id: "a5555555-5555-4555-8555-555555555555",
    originalName: "Scanned Handout.pdf",
    status: "failed",
    stage: "extract",
    progress: null,
    error: { code: "NO_READABLE_TEXT", message: MATERIAL_FAILURE_REASONS.NO_READABLE_TEXT },
    pageCount: 12,
    sizeBytes: 4_400_000,
    createdAt: "2026-11-10T06:30:00.000Z",
    updatedAt: "2026-11-10T06:34:00.000Z",
  },
  {
    id: "a6666666-6666-4666-8666-666666666666",
    originalName: "Cannot Delete Example.pdf",
    status: "ready",
    stage: "suggest_topics",
    progress: null,
    error: null,
    pageCount: 5,
    sizeBytes: 900_000,
    createdAt: "2026-11-08T11:00:00.000Z",
    updatedAt: "2026-11-08T11:03:00.000Z",
    forceDeleteFailure: true,
  },
];
