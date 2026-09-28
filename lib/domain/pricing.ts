/**
 * Weekly, quarterly and yearly prices from the monthly one: a quarter is three
 * months less 10%, a year twelve less 20%, a week a quarter of a month. Every
 * new monthly price takes the other three from here, so none goes stale; the
 * crawler applies the same rule (scraper/scraper.py).
 */
export function derivedPrices(monthly: number) {
  return {
    price:          monthly,
    priceWeekly:    Math.round(monthly / 4),
    priceQuarterly: Math.round(monthly * 3 * 0.9),
    priceYearly:    Math.round(monthly * 12 * 0.8),
  };
}
