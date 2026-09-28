/**
 * A mean rating as the site shows it: one decimal place, and 0 for a media item
 * nobody has rated yet (the card then shows no stars rather than a blank).
 */
export function averageRating(mean: number | null | undefined): number {
  return mean == null ? 0 : Math.round(mean * 10) / 10;
}

/**
 * Lengths a review and a staff reply must keep. The routes validate against
 * them and the form checks and states the same numbers before sending.
 */
export const REVIEW_COMMENT = { min: 10, max: 1000 } as const;
export const REVIEW_REPLY = { min: 2, max: 600 } as const;
