import { z } from "zod";

/**
 * The shapes of a billboard's JSON columns. A JSON column holds whatever was
 * last written — the seed, the crawler, a script — so lib/db/billboards/core.ts
 * reads every row through these instead of trusting a cast.
 */
export const TrafficSchema = z.object({
  daily:            z.number(),
  peakHour:         z.string(),
  congestionLevel:  z.number(),
  pedestrian:       z.number(),
  estimatedViews:   z.number(),
  viewabilityScore: z.number(),
});

export const StringListSchema = z.array(z.string());

/**
 * A crawled row's availability from the feed's `status`. A crawler's
 * "available" means "listed at the source", not "free now" — no source
 * publishes that — so it becomes `unknown` («استعلام از مالک»). Null for a
 * status the enum lacks.
 */
export function availabilityFromFeed(status: unknown): "busy" | "reserved" | "inactive" | "unknown" | null {
  switch (status) {
    case "available":
    case "unknown":  return "unknown";
    case "busy":     return "busy";
    case "reserved": return "reserved";
    case "inactive": return "inactive";
    default:         return null;
  }
}

/** What a media item with no traffic survey shows: a zeroed block. */
export const NO_TRAFFIC: z.infer<typeof TrafficSchema> = {
  daily: 0, peakHour: "08:00", congestionLevel: 5, pedestrian: 0, estimatedViews: 0, viewabilityScore: 0,
};

/**
 * The states a listing can still be decided from: anything not approved, so a
 * decision that published nothing can be reversed, and a second click cannot
 * re-grant a paid promotion.
 */
export const UNDECIDED = ["pending", "awaiting_payment", "needs_revision", "rejected"] as const;

/**
 * What staff may type for size, faces and price: integers, as the columns are,
 * with the same 200 m ceiling a listing and the nightly import use — so a bad
 * value gets a sentence, not a failed write.
 */
export const SizeMetres = z.number().int("ابعاد باید عدد صحیح (متر) باشد").min(1).max(200);
export const FaceCount  = z.number().int().min(1).max(12);
export const MonthlyPrice = z.number().int("قیمت باید عدد صحیح باشد").min(0).max(100_000);
