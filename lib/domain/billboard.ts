import { z } from "zod";

/**
 * The shapes of a billboard's JSON columns.
 *
 * SQLite has no array or record type, so `traffic`, `images`, `features` and
 * the rest are stored as JSON — and a JSON column is whatever was last written
 * to it: the seed, the crawler's feed, an admin's edit, a hand-run script. The
 * compiler cannot see inside one, and the row mapper used to assert the shape
 * with `as unknown as` and hope. These schemas are the assertion made real;
 * lib/db/billboards/core.ts reads every row through them.
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

/** What a media item with no traffic survey shows: a zeroed block. */
export const NO_TRAFFIC: z.infer<typeof TrafficSchema> = {
  daily: 0, peakHour: "08:00", congestionLevel: 5, pedestrian: 0, estimatedViews: 0, viewabilityScore: 0,
};

/**
 * Who may decide on a listing: anything not yet approved. `needs_revision` and
 * `rejected` are included on purpose — an admin can still reverse a decision
 * that has not published anything — while an approved listing is live and can
 * no longer be re-decided (a second click must not re-grant a paid promotion).
 */
export const UNDECIDED = ["pending", "awaiting_payment", "needs_revision", "rejected"] as const;
