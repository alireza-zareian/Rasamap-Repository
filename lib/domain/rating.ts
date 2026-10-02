/**
 * A mean rating as the site shows it: one decimal place, and 0 for a media item
 * nobody has rated yet (the card then shows no stars rather than a blank).
 */
export function averageRating(mean: number | null | undefined): number {
  return mean == null ? 0 : Math.round(mean * 10) / 10;
}

/** A rating as the site shows it: the mean, and how many ratings it is over. */
export interface RatingSummary {
  rating: number;
  count: number;
}

/** A 32-bit integer hash of an id, so neighbouring ids get unrelated values. */
function mix(id: number, salt: number): number {
  let h = Math.imul(id ^ salt, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * A demonstration rating for a media item, for a catalogue that has no
 * reviews of its own yet (§42). Derived from the id alone: the same on every
 * card, page, machine and restart, with nothing stored. 3.8 to 5.0 stars over
 * 3 to 42 ratings, the range the crawler used to invent.
 */
export function demoRating(id: number): RatingSummary {
  return {
    rating: (38 + (mix(id, 0x5bd1e995) % 13)) / 10,
    count: 3 + (mix(id, 0x27d4eb2f) % 40),
  };
}

/**
 * Two summaries as one, each mean weighted by its count: a real review joins
 * the demonstration figures instead of replacing them, so a card that read
 * "(34)" reads "(35)" after it, not "(1)".
 */
export function combineRatings(a: RatingSummary, b: RatingSummary): RatingSummary {
  const count = a.count + b.count;
  if (count === 0) return { rating: 0, count: 0 };
  return { rating: averageRating((a.rating * a.count + b.rating * b.count) / count), count };
}

/**
 * Lengths a review and a staff reply must keep. The routes validate against
 * them and the form checks and states the same numbers before sending.
 */
export const REVIEW_COMMENT = { min: 10, max: 1000 } as const;
export const REVIEW_REPLY = { min: 2, max: 600 } as const;
