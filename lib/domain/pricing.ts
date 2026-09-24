/**
 * The weekly, quarterly and yearly prices, from the monthly one.
 *
 * A quarter is three months less 10%, a year twelve months less 20%, and a week
 * a quarter of a month. Every row that gets a new monthly price — an admin
 * create or edit, a submitted or resubmitted listing — takes the other three
 * from here, so a price edited in one place cannot sit next to three stale ones
 * on the detail page. (The crawler applies the same rule in
 * scraper/scraper.py.)
 */
export function derivedPrices(monthly: number) {
  return {
    price:          monthly,
    priceWeekly:    Math.round(monthly / 4),
    priceQuarterly: Math.round(monthly * 3 * 0.9),
    priceYearly:    Math.round(monthly * 12 * 0.8),
  };
}
