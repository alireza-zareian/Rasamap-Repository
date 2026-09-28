/**
 * A campaign: a handful of media priced for one period together (§40). The
 * page, the tray on the catalogue and a shared link all go through here, so
 * the arithmetic and the limits live in one place.
 */

/** Media in one campaign. Enough for a city-wide plan; small enough to read side by side. */
export const MAX_PICKED = 8;

/** What the planner needs of a media item; a CatalogueItem has all of it. */
export interface PlannedMedia {
  city: string;
  type: string;
  /** Millions of toman for each period, as stored (lib/domain/pricing.ts derives them). */
  price: number;
  priceWeekly: number;
  priceQuarterly: number;
  priceYearly: number;
  traffic: { daily: number; estimatedViews: number };
}

export type CampaignPeriod = "week" | "month" | "quarter" | "year";

export const CAMPAIGN_PERIODS: Record<CampaignPeriod, { label: string; days: number; price: (m: PlannedMedia) => number }> = {
  week:    { label: "یک هفته",  days: 7,   price: (m) => m.priceWeekly },
  month:   { label: "یک ماه",   days: 30,  price: (m) => m.price },
  quarter: { label: "سه ماه",   days: 90,  price: (m) => m.priceQuarterly },
  year:    { label: "یک سال",   days: 365, price: (m) => m.priceYearly },
};

export const CAMPAIGN_PERIOD_KEYS = Object.keys(CAMPAIGN_PERIODS) as CampaignPeriod[];

export function isCampaignPeriod(value: string): value is CampaignPeriod {
  return Object.hasOwn(CAMPAIGN_PERIODS, value);
}

export interface CampaignTotals {
  /** Millions of toman for the whole period. */
  cost: number;
  /** Estimated people who see at least one board, per day (the traffic model's `estimatedViews`). */
  dailyViews: number;
  /** Daily views over the period's days. */
  impressions: number;
  /**
   * Toman per thousand impressions, the unit outdoor media is compared in;
   * null when nothing in the plan has a view estimate.
   */
  cpm: number | null;
  /** Each item's share of the cost, 0–1, in the order given. */
  shares: number[];
  cities: string[];
}

export function campaignTotals(items: readonly PlannedMedia[], period: CampaignPeriod): CampaignTotals {
  const { days, price } = CAMPAIGN_PERIODS[period];
  const costs = items.map(price);
  const cost = costs.reduce((a, b) => a + b, 0);
  const dailyViews = items.reduce((a, m) => a + (m.traffic.estimatedViews || 0), 0);
  const impressions = dailyViews * days;
  return {
    cost,
    dailyViews,
    impressions,
    cpm: impressions > 0 ? Math.round((cost * 1_000_000) / (impressions / 1000)) : null,
    shares: costs.map((c) => (cost > 0 ? c / cost : 0)),
    cities: [...new Set(items.map((m) => m.city))],
  };
}

/** The shape slugify() gives (lib/domain/slug.ts); anything else names no media. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * The `?m=` of a shared campaign link: comma-separated slugs, deduplicated, cut
 * to MAX_PICKED. Anything that is not a slug is dropped, never looked up.
 */
export function parsePickedSlugs(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (SLUG.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === MAX_PICKED) break;
  }
  return out;
}
