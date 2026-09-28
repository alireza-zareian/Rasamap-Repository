import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  CATALOGUE_TAG,
  getBillboardBySlug,
  getFilteredBillboards,
  getRelatedBillboards,
  getShowcaseBillboards,
  toCatalogueItem,
  toPublicBillboard,
  type BillboardFilterParams,
  getMapPins,
  slugExists,
} from "./billboards";
import { getSiteStats } from "./stats";
import { getCatalogueAnalytics } from "./analytics";
import type { Billboard, CatalogueItem } from "../types";

/**
 * Catalogue reads, cached across requests: the catalogue changes a few times a
 * day, so two visitors asking the same question should not both reach SQLite.
 *
 * `unstable_cache` rather than `use cache`: Cache Components were measured and
 * gained nothing (/explore 10.24 → 10.32 ms), and `use cache` needs a different
 * handler interface than cache-handler.js implements (§26).
 */

/** A write does not wait for this: ./billboards/mutations.ts drops the tag. */
const CATALOGUE_TTL = 300;

const cacheOptions = { revalidate: CATALOGUE_TTL, tags: [CATALOGUE_TAG] };

/**
 * A filtered page, narrowed to what a card draws inside the cached function, so
 * what is stored is exactly what may reach a browser.
 */
async function filteredCataloguePage(p: BillboardFilterParams): Promise<{ items: CatalogueItem[]; total: number }> {
  const { items, total } = await getFilteredBillboards(p);
  return { items: items.map(toCatalogueItem), total };
}

const cachedCataloguePage = unstable_cache(filteredCataloguePage, ["catalogue-page"], cacheOptions);

/** People open the first pages of a filter; deeper ones run uncached (about 2 ms). */
const CACHED_PAGES = 5;

/**
 * Whether a filter has too many possible values to cache. Each distinct
 * argument is a file, so free text, a map centre, a price ceiling or a deep
 * page would let a loop fill the disk — and nobody repeats those queries.
 */
function isOpenEnded(p: BillboardFilterParams): boolean {
  return !!p.search || !!p.near || p.maxPrice !== undefined || (p.page ?? 1) > CACHED_PAGES;
}

export function getCachedFilteredBillboards(p: BillboardFilterParams) {
  return isOpenEnded(p) ? filteredCataloguePage(p) : cachedCataloguePage(p);
}

/** The carousels' list — the same whatever the filter, so cached on its own. */
export const getCachedShowcaseBillboards = unstable_cache(
  async (limit: number): Promise<CatalogueItem[]> =>
    (await getShowcaseBillboards(limit)).map(toCatalogueItem),
  ["catalogue-showcase"],
  cacheOptions,
);

/** Map pins under the catalogue's filter: every coordinate, no photographs. */
const cachedMapPins = unstable_cache(getMapPins, ["map-pins"], cacheOptions);

export function getCachedMapPins(p: BillboardFilterParams) {
  return isOpenEnded(p) ? getMapPins(p) : cachedMapPins(p);
}

export const getCachedSiteStats = unstable_cache(getSiteStats, ["site-stats"], cacheOptions);

const cachedAnalytics = unstable_cache(
  (city: string | null) => getCatalogueAnalytics(city ?? undefined),
  ["catalogue-analytics"],
  cacheOptions,
);

/**
 * The /analytics figures, country-wide or for one city (twelve queries, about
 * 11 ms). Cached only for a city that has published media, so entries are
 * bounded by the catalogue, not by what a caller types; any other name gets the
 * empty figures without a query.
 */
export async function getCachedCatalogueAnalytics(city?: string) {
  if (!city) return cachedAnalytics(null);
  const { byCity } = await getCachedSiteStats();
  if (!Object.hasOwn(byCity, city)) return cachedAnalytics("\u0000none");
  return cachedAnalytics(city);
}

/**
 * One media item for its own page. The phone is dropped here; only whether one
 * exists comes back, so the page knows to offer the button. The number itself
 * is given only by POST /api/billboards/[slug]/contact, to a signed-in caller (§23).
 */
type MediaPage = { billboard: Billboard; phoneAvailable: boolean } | null;

async function mediaPage(slug: string, includeUnpublished: boolean): Promise<MediaPage> {
  const row = await getBillboardBySlug(slug, { includeUnpublished });
  if (!row) return null;
  return {
    billboard: toPublicBillboard(row),
    phoneAvailable: !!(row.phone && row.phone !== "—" && row.phone.trim()),
  };
}

const cachedMediaPage = unstable_cache(mediaPage, ["billboard-by-slug"], cacheOptions);

/**
 * Only a slug that exists reaches the cache, which would otherwise store a file
 * for every made-up address. A staff preview is never cached, so it cannot
 * share an entry with the public. React's cache() lets the page and its
 * generateMetadata share one lookup per request.
 */
export const getCachedBillboardBySlug = cache(async (slug: string, includeUnpublished: boolean): Promise<MediaPage> => {
  if (includeUnpublished) return mediaPage(slug, true);
  if (!(await slugExists(slug))) return null;
  return cachedMediaPage(slug, false);
});

/** The suggestions under a media page: up to three queries, keyed by id, city and type. */
export const getCachedRelatedBillboards = unstable_cache(
  async (
    ref: Pick<Billboard, "id" | "city" | "type">,
    limit: number,
  ): Promise<CatalogueItem[]> =>
    (await getRelatedBillboards(ref, limit)).map(toCatalogueItem),
  ["billboard-related"],
  cacheOptions,
);
