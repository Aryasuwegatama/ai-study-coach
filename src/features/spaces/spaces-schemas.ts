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
