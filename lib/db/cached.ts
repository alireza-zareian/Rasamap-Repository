import { unstable_cache } from "next/cache";
import {
  CATALOGUE_TAG,
  getFilteredBillboards,
  getShowcaseBillboards,
  toPublicBillboard,
  type BillboardFilterParams,
} from "./billboards";
import { getSiteStats } from "./stats";
import type { Billboard } from "../types";

/**
 * Catalogue reads, cached across requests.
 *
 * This is the half of V1 that makes the server *cooler* rather than merely
 * better-indexed. Rendering /explore on the server removes one HTTP round-trip
 * and one JSON serialisation per visit, but the Prisma query is the same query
 * either way — it only moved. Caching it is what removes the database from the
 * repeat visit entirely: the catalogue changes a few times a day, not a few
 * times a second, so two visitors a minute apart looking at the same filter
 * have no business asking SQLite the same question twice.
 *
 * `unstable_cache` and not the `use cache` directive that supersedes it in
 * Next.js 16: `use cache` requires `cacheComponents: true` in next.config.ts,
 * which removes `export const revalidate` (used by app/sitemap.ts and
 * GET /api/stats) and demands a Suspense boundary around every request-time
 * API in the tree. That is a migration of its own, not part of V1.
 */

/**
 * Five minutes. Long enough that a burst of visitors on one filter costs a
 * single query; short enough that the ceiling on how stale the catalogue can
 * look is still under the time it takes to notice. A write does not wait for
 * it: the mutations in ./billboards.ts drop CATALOGUE_TAG as they write.
 */
const CATALOGUE_TTL = 300;

const cacheOptions = { revalidate: CATALOGUE_TTL, tags: [CATALOGUE_TAG] };

/**
 * A filtered page of the catalogue, already stripped of private fields.
 *
 * The projection happens inside the cached function on purpose: what is stored
 * is then exactly what may be sent to a browser, so no caller can forget.
 */
export const getCachedFilteredBillboards = unstable_cache(
  async (p: BillboardFilterParams): Promise<{ items: Billboard[]; total: number }> => {
    const { items, total } = await getFilteredBillboards(p);
    return { items: items.map(toPublicBillboard), total };
  },
  ["catalogue-page"],
  cacheOptions,
);

export const getCachedShowcaseBillboards = unstable_cache(
  async (limit: number): Promise<Billboard[]> =>
    (await getShowcaseBillboards(limit)).map(toPublicBillboard),
  ["catalogue-showcase"],
  cacheOptions,
);

export const getCachedSiteStats = unstable_cache(
  getSiteStats,
  ["site-stats"],
  cacheOptions,
);
