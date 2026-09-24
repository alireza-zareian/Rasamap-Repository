/**
 * A mean rating as the site shows it: one decimal place, and 0 for a media item
 * nobody has rated yet (the card then shows no stars rather than a blank).
 */
export function averageRating(mean: number | null | undefined): number {
  return mean == null ? 0 : Math.round(mean * 10) / 10;
}
