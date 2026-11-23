import { z } from "zod";

/**
 * PRD Section 2: "A name is required (1-150 characters)". Trimmed first,
 * so whitespace-only input hits the "required" message rather than a
 * confusing length one. Plain `z.object` below (not `.strict()`): Security
 * rule 1 says a stray field such as `ownerId` is ignored, not rejected —
 * Zod's default `z.object` already strips unknown keys rather than
 * erroring on them.
 */
export const spaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a study space name.")
  .max(150, "Use 150 characters or fewer.");

export const createSpaceSchema = z.object({
  name: spaceNameSchema,
});

export const renameSpaceSchema = z.object({
  name: spaceNameSchema,
});

/** The space shape every route and page gets — never `ownerId` or `deletedAt`. */
export type SpaceResponse = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * What a Study Space card shows (Dashboard and Study Spaces): counts only.
 * There is never an average or an overall mastery number.
 */
export type SpaceSummary = {
  id: string;
  name: string;
  /** Materials in the space (any status). */
  materialCount: number;
  /** Confirmed topics (archived ones are not counted). */
  confirmedTopicCount: number;
  weakTopicCount: number;
  /** Materials in status `review_topics`, shown to the student as "Topics ready". */
  topicsReadyCount: number;
  /** Quizzes the student started and hasn't submitted. */
  quizzesInProgress: number;
};
