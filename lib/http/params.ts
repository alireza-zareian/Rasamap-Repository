import { z } from "zod";

/** A positive integer from a path segment. Digits only: `z.coerce.number()` accepts "1e3" and "0x1f". */
export const positiveId = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number);

/** The common `[id]` segment. */
export const idParams = z.object({ id: positiveId });

/** Lowercase Latin, digits and hyphens — what slugify (lib/domain/slug.ts) makes. */
export const slugParams = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });

/** `?page=&limit=` with the ceilings every paged admin list shares. */
export function pageQuery(maxLimit: number, defaultLimit = 20) {
  return {
    page:  z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  };
}
