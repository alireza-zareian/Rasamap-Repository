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
} from "./billboards";
import { getSiteStats } from "./stats";
import type { Billboard, CatalogueItem } from "../types";

/**
 * Catalogue reads, cached across requests.
 *
 * This is the half of V1 that makes the server cooler rather than merely
 * better-indexed. Rendering /explore on the server removes one HTTP round-trip
 * and one JSON serialisation per visit, but the Prisma query is the same query
 * either way — it only moved. Caching is what removes the database from the
 * repeat visit entirely: the catalogue changes a few times a day, not a few
 * times a second, so two visitors a minute apart looking at the same filter
 * have no business asking SQLite the same question twice.
 *
 * `unstable_cache` and not the `use cache` directive that supersedes it in
 * Next.js 16. That was tried and measured, not assumed: enabling Cache
 * Components and caching the rendered output as well as the query moved
 * /explore from 10.24 to 10.32 ms and the media page from 14.3 to 14.7 — no
 * gain, because what remains is React turning the tree into HTML bytes, which
 * happens on every request whether the tree was cached or not. It would also
 * have cost the shared cache: `use cache` reads a different handler interface
 * (`cacheHandlers`, plural) than cache-handler.js implements. §26 of
 * docs/engineering-decisions.md has the numbers.
 */

/** Five minutes: far finer than the catalogue actually changes, and a write
 *  does not wait for it — the mutations in ./billboards.ts drop the tag. */
const CATALOGUE_TTL = 300;

const cacheOptions = { revalidate: CATALOGUE_TTL, tags: [CATALOGUE_TAG] };

/**
 * A filtered page of the catalogue, narrowed to what a card draws.
 *
 * The projection happens inside the cached function on purpose: what is stored
 * is then exactly what may be sent to a browser, so no caller can forget — and
 * the cache holds the smaller object rather than the record it came from.
 */
export const getCachedFilteredBillboards = unstable_cache(
  async (p: BillboardFilterParams): Promise<{ items: CatalogueItem[]; total: number }> => {
    const { items, total } = await getFilteredBillboards(p);
    return { items: items.map(toCatalogueItem), total };
  },
  ["catalogue-page"],
  cacheOptions,
);

/**
 * The photographed, busiest media items behind the carousels.
 *
 * Cached separately from a catalogue page because it is the same list whatever
 * the visitor filtered by — folding it in would re-run one query per filter
 * combination for an identical answer.
 */
export const getCachedShowcaseBillboards = unstable_cache(
  async (limit: number): Promise<CatalogueItem[]> =>
    (await getShowcaseBillboards(limit)).map(toCatalogueItem),
  ["catalogue-showcase"],
  cacheOptions,
);

export const getCachedSiteStats = unstable_cache(getSiteStats, ["site-stats"], cacheOptions);

/**
 * One media item by slug, for its own page.
 *
 * `includeUnpublished` is part of the key rather than something this function
 * decides, so a reviewer's view of a listing still under review can never be
 * served to a visitor: the two are different entries.
 *
 * Whether a contact number exists comes back alongside the record, because the
 * number itself is dropped before the record leaves here. The page needs to
 * know whether to offer the button, and asking the database again for a boolean
 * it has already seen would undo the point of caching the first question. The
 * number is handed out only by POST /api/billboards/[slug]/contact, to a
 * signed-in caller, as a lead (§23).
 */
export const getCachedBillboardBySlug = unstable_cache(
  async (
    slug: string,
    includeUnpublished: boolean,
  ): Promise<{ billboard: Billboard; phoneAvailable: boolean } | null> => {
    const row = await getBillboardBySlug(slug, { includeUnpublished });
    if (!row) return null;
    return {
      billboard: toPublicBillboard(row),
      phoneAvailable: !!(row.phone && row.phone !== "—" && row.phone.trim()),
    };
  },
  ["billboard-by-slug"],
  cacheOptions,
);

/**
 * The suggestions at the foot of a media page.
 *
 * Worth caching on its own: it is up to three widening queries per visit, and
 * every listing in a city shares the same answer for that city and media type.
 * Keyed by those three fields rather than by the whole record, so one entry
 * serves every neighbour.
 */
export const getCachedRelatedBillboards = unstable_cache(
  async (
    ref: Pick<Billboard, "id" | "city" | "type">,
    limit: number,
  ): Promise<CatalogueItem[]> =>
    (await getRelatedBillboards(ref, limit)).map(toCatalogueItem),
  ["billboard-related"],
  cacheOptions,
);
