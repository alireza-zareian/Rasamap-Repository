import "server-only";
import type { Billboard as Row, Prisma } from "@prisma/client";
import { prisma } from "../client";
import { isPostgres } from "../engine";
import type { Billboard } from "../../types";
import { distanceKm } from "../../geo";
import { fromRow, UNPUBLISHED_STATUSES, publishedOnly } from "./core";

/** Every read of the billboards table. Nothing here writes or invalidates. */

/**
 * Every column of every row, unbounded — including the JSON blobs (`traffic`,
 * `images`, `allImages`, `features`, `nearbyLandmarks`). Nothing in this
 * codebase calls it today; `getAdminStatsRows()` (lib/db/stats.ts) used to be
 * built on exactly this shape and was refactored away from it specifically
 * because it cost ~95ms against ~8ms for the eight columns it actually needs.
 * Reach for `getFilteredBillboards()` or a narrower `select` instead — this
 * exists as the documented ORM entry point AGENTS.md/CLAUDE.md point future
 * work at, not as something to call on a read-heavy path.
 */
export async function getAllBillboards(): Promise<Billboard[]> {
  const rows = await prisma.billboard.findMany({ orderBy: [{ hasImages: "desc" }, { id: "asc" }] });
  return rows.map(fromRow);
}

export interface BillboardFilterParams {
  search?: string;
  type?: string;
  status?: string;
  city?: string;
  cityIn?: string[];   // province-level: all cities in that province
  maxPrice?: number;
  sortBy?: string;
  page?: number;
  limit?: number;
  /** Centre of a radial search. Both coordinates or neither. */
  near?: { lat: number; lng: number; radiusKm: number };
}

/**
 * The box that contains a circle, in degrees.
 *
 * A radial search runs in two passes because SQL cannot filter on a distance
 * this schema does not store: this box narrows the table in the query, and the
 * exact circle is cut from what comes back. The box is generous — its corners
 * reach out to 1.41 radii — which is the point: it may not drop a row the
 * circle would have kept.
 *
 * Longitude degrees shrink towards the poles, so the east-west half-width is
 * divided by the cosine of the latitude. At Tehran that makes it about a fifth
 * wider than the north-south one.
 */
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  // Guard the pole case, where cos approaches zero and the box would explode.
  const dLng = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    lat: { gte: lat - dLat, lte: lat + dLat },
    lng: { gte: lng - dLng, lte: lng + dLng },
  };
}

/**
 * A ceiling on the box a radial search reads before cutting the circle.
 *
 * The radius cap already bounds this — the widest allowed box holds a few
 * hundred rows on this dataset — so the limit is a backstop against a denser
 * dataset later, not a working constraint. It sits well above the largest box
 * anyone can currently ask for, so no real search is truncated by it.
 */
const NEAR_SCAN_LIMIT = 3000;

// Every entry leads with `featured` (a paid, admin-granted promotion) and then
// `hasImages`, so paid listings sit at the top and photographed ones above bare
// records. `traffic_desc` and `area_desc` sort on the denormalised
// `estimatedViews` and `area` columns: both are derived values (one from the
// traffic JSON, one from width x height) and Prisma cannot ORDER BY an
// expression or a JSON path.
//
// Every entry ends with `id`, which is not decoration: without a unique last
// term the order *within* a group of equal keys is whatever the engine happens
// to produce, and paging is LIMIT/OFFSET over that order. On this dataset the
// 3,532 published rows fall into 717 distinct (featured, hasImages, price)
// groups and the largest holds 153 rows — six pages of identical sort keys.
// SQLite answers them consistently today, so nothing is visibly wrong; Postgres
// makes no such promise, and the migration path in §27 is meant to be a change
// of engine, not a change of behaviour. One indexed integer closes it, and it
// measured the same 2 ms with and without.
const SORT_MAP: Record<string, Prisma.BillboardOrderByWithRelationInput[]> = {
  price_asc:    [{ featured: "desc" }, { hasImages: "desc" }, { price: "asc" },  { id: "asc" }],
  price_desc:   [{ featured: "desc" }, { hasImages: "desc" }, { price: "desc" }, { id: "asc" }],
  traffic_desc: [{ featured: "desc" }, { hasImages: "desc" }, { estimatedViews: "desc" }, { id: "asc" }],
  area_desc:    [{ featured: "desc" }, { hasImages: "desc" }, { area: "desc" }, { id: "asc" }],
};

/**
 * The one place the two engines disagree about behaviour rather than syntax.
 *
 * SQLite's LIKE ignores case for ASCII, so `contains: "billboardiha"` finds
 * "Billboardiha" today. PostgreSQL's does not, and would quietly return fewer
 * results for the same search after a migration — the kind of difference that
 * shows up as "search got worse" rather than as an error. Asking Postgres for
 * the behaviour SQLite already has keeps the two the same.
 *
 * Persian has no case, so this changes nothing for most searches; it matters
 * for the agency names, which are Latin.
 */
const caseInsensitive = isPostgres() ? { mode: "insensitive" as const } : {};

function buildWhere(p: BillboardFilterParams): Prisma.BillboardWhereInput {
  const where: Prisma.BillboardWhereInput = {};
  if (p.type)      where.type   = p.type;
  // An unpublished row is never public, whatever status the caller asked for —
  // the exclusion is applied here rather than left to each route's allowlist.
  where.status = p.status && !UNPUBLISHED_STATUSES.includes(p.status)
    ? p.status
    : publishedOnly;
  if (p.city)      where.city   = p.city;
  else if (p.cityIn?.length) where.city = { in: p.cityIn };
  if (p.maxPrice !== undefined) where.price = { lte: p.maxPrice };
  if (p.near) {
    const box = boundingBox(p.near.lat, p.near.lng, p.near.radiusKm);
    where.lat = box.lat;
    where.lng = box.lng;
  }
  if (p.search) {
    const s = p.search.trim();
    where.OR = [
      { name:     { contains: s, ...caseInsensitive } },
      { city:     { contains: s, ...caseInsensitive } },
      { location: { contains: s, ...caseInsensitive } },
      { agency:   { contains: s, ...caseInsensitive } },
    ];
  }
  return where;
}

export async function getFilteredBillboards(
  p: BillboardFilterParams,
): Promise<{ items: Billboard[]; total: number }> {
  const page  = Math.max(1, p.page  ?? 1);
  // 48 is two screens of results. The ceiling is deliberately low: a bigger
  // page size buys a real visitor nothing and only makes bulk copying cheaper.
  const limit = Math.min(48, Math.max(1, p.limit ?? 24));
  const orderBy = SORT_MAP[p.sortBy ?? ""] ?? SORT_MAP.price_asc;
  const where = buildWhere(p);

  // A radial search cannot be paged by the database, because the circle is cut
  // after the rows come back: asking for rows 25-48 of the *box* and then
  // dropping the corners would leave a short page and a wrong total. So the box
  // is read whole, the circle is cut, and the page is taken from what is left.
  //
  // That is affordable only because the radius is capped (MAX_RADIUS_KM) and
  // the box is therefore small. Measured on this dataset: a 10 km box is 340
  // rows and the whole two-pass search costs about 0.9 ms — roughly a seventh
  // of what the ordinary catalogue query already spends on every page view.
  if (p.near) {
    // Two queries, and the split is the point: the first asks only for what the
    // circle needs to judge a row — an id and a coordinate — so the box can be
    // read wide without dragging every record's JSON columns along with it. The
    // second fetches whole rows for the one page being shown.
    //
    // Reading full rows in the first pass instead cost 37 ms at the 50 km
    // ceiling against 23 ms for an ordinary catalogue page; this shape brings it
    // back under that. `orderBy` is repeated so the page keeps the sort the
    // caller asked for.
    const candidates = await prisma.billboard.findMany({
      where, orderBy, take: NEAR_SCAN_LIMIT,
      select: { id: true, lat: true, lng: true },
    });
    const inside = candidates.filter(
      (r) =>
        r.lat !== null &&
        r.lng !== null &&
        distanceKm(p.near!.lat, p.near!.lng, r.lat, r.lng) <= p.near!.radiusKm,
    );
    const start = (page - 1) * limit;
    const pageIds = inside.slice(start, start + limit).map((r) => r.id);
    if (pageIds.length === 0) return { items: [], total: inside.length };

    const rows = await prisma.billboard.findMany({ where: { id: { in: pageIds } }, orderBy });
    return { items: rows.map(fromRow), total: inside.length };
  }

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.billboard.count({ where }),
  ]);

  return { items: rows.map(fromRow), total };
}

/**
 * The photographed, busiest media items behind the landing gallery and the
 * catalogue's hero carousel.
 *
 * `hasImages` is filtered in the query rather than by fetching a wider page and
 * dropping the imageless rows in JS: the carousels show photos and nothing
 * else, so a record without one is not a near-miss, it is not a candidate.
 */
export async function getShowcaseBillboards(limit: number): Promise<Billboard[]> {
  const rows = await prisma.billboard.findMany({
    where:   { status: publishedOnly, hasImages: true },
    orderBy: [{ featured: "desc" }, { estimatedViews: "desc" }],
    take:    limit,
  });
  return rows.map(fromRow);
}

/** The lean row a map pin needs — nothing that is not drawn or linked to. */
export interface MapPin {
  slug: string;
  name: string;
  city: string;
  type: string;
  price: number;
  lat: number;
  lng: number;
}

/**
 * A ceiling, not a page size. The map has no "next page", so an unbounded
 * query is the one shape that could hand a crawler the whole coordinate set in
 * a single request — which is exactly what §20 keeps the catalogue from doing.
 * No single city comes close to it.
 */
const MAP_PIN_LIMIT = 1200;

/**
 * Coordinates for the pins under the current filter.
 *
 * Selects seven columns instead of the row, because a pin is a dot with a
 * label: pulling `images`, `traffic` and `features` for a thousand rows would
 * cost more than everything else the map does put together.
 *
 * `buildWhere` is shared with the catalogue on purpose — the map is another
 * view of the same result set, so a filter that narrows one must narrow the
 * other identically, including the published-only rule.
 */
export async function getMapPins(p: BillboardFilterParams): Promise<MapPin[]> {
  const rows = await prisma.billboard.findMany({
    where: { ...buildWhere(p), lat: { not: null }, lng: { not: null } },
    select: {
      slug: true, name: true, city: true, type: true,
      price: true, lat: true, lng: true,
    },
    orderBy: { estimatedViews: "desc" },
    take: MAP_PIN_LIMIT,
  });
  // `lat: { not: null }` already excludes the nulls; this narrows the type
  // without a cast, and costs one pass over rows that are already in memory.
  return rows.flatMap((r) =>
    r.lat === null || r.lng === null ? [] : [{ ...r, lat: r.lat, lng: r.lng }],
  );
}

// Admin table listing — filter, sort and paginate in the DB (not by loading
// every row and slicing in JS).
export interface AdminBillboardQuery {
  q?: string;
  city?: string;
  type?: string;
  status?: string;
  sortKey: "id" | "price" | "name" | "city";
  sortDir: "asc" | "desc";
  page: number;
  limit: number;
}

export async function getAdminBillboardPage(
  p: AdminBillboardQuery,
): Promise<{ items: Billboard[]; total: number; pages: number }> {
  const where: Prisma.BillboardWhereInput = {};
  if (p.city)   where.city   = p.city;
  if (p.type)   where.type   = p.type;
  if (p.status) where.status = p.status;
  if (p.q) {
    where.OR = [
      { name:     { contains: p.q, ...caseInsensitive } },
      { location: { contains: p.q, ...caseInsensitive } },
      // A slug, so pasting the tail of a public URL finds the row — which is
      // what "edit this listing" on the staff bar does.
      { slug:     { contains: p.q, ...caseInsensitive } },
    ];
  }

  // `id` breaks ties for the same reason the public sort does — sorting the
  // admin table by city puts hundreds of rows on one key.
  const orderBy: Prisma.BillboardOrderByWithRelationInput[] =
    p.sortKey === "id" ? [{ id: p.sortDir }] : [{ [p.sortKey]: p.sortDir }, { id: "asc" }];

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({ where, orderBy, skip: (p.page - 1) * p.limit, take: p.limit }),
    prisma.billboard.count({ where }),
  ]);

  return { items: rows.map(fromRow), total, pages: Math.max(1, Math.ceil(total / p.limit)) };
}

export async function getBillboardById(id: number): Promise<Billboard | null> {
  const row = await prisma.billboard.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

/**
 * Public lookup by slug. Every caller (the REST route, the contact route and
 * the detail Server Component) is public, so a listing still awaiting admin
 * approval must not resolve here — otherwise an unapproved submission would be
 * reachable at its own URL even though it is hidden from search, the map, the
 * stats and the sitemap. Admin screens read by id via getBillboardById().
 */
/**
 * One media item by its slug.
 *
 * Unpublished rows are invisible: a submission awaiting review must not be
 * reachable by guessing its address, the same way it is kept out of search, the
 * statistics and the sitemap.
 *
 * `includeUnpublished` lifts that for a reviewer looking at a submission on the
 * real page instead of in a form. It is a parameter and not a lookup inside
 * this function on purpose — a data-access function that decides for itself who
 * is asking is a function whose callers stop thinking about it. The only caller
 * that passes true does so after checking the session on the server.
 */
export async function getBillboardBySlug(
  slug: string,
  { includeUnpublished = false } = {},
): Promise<Billboard | null> {
  const row = await prisma.billboard.findUnique({ where: { slug } });
  if (!row) return null;
  if (!includeUnpublished && UNPUBLISHED_STATUSES.includes(row.status)) return null;
  return fromRow(row);
}

/**
 * Suggestions for the foot of a media page.
 *
 * Three widening rings: the same city and the same kind of media first, then
 * anything else in that city, then the same kind anywhere. Each ring only fills
 * what the ones before it left empty, and nothing repeats.
 *
 * `region` is deliberately not part of this. In this dataset it is a free-text
 * neighbourhood label — "مرکز شهر", "منطقه ۵", sometimes a whole sentence — so
 * it is close to unique per row (Zanjan: 58 records, 58 distinct regions) and it
 * repeats across cities that have nothing to do with each other. Matching on it
 * found nothing, every page fell through to one national list, and the same
 * dozen Tehran billboards were suggested under every listing in the country.
 */
export async function getRelatedBillboards(
  ref: Pick<Billboard, "id" | "city" | "type">,
  limit = 12,
): Promise<Billboard[]> {
  const orderBy: Prisma.BillboardOrderByWithRelationInput[] = [
    { featured: "desc" }, { hasImages: "desc" }, { estimatedViews: "desc" },
  ];

  const rings: Prisma.BillboardWhereInput[] = [
    { city: ref.city, type: ref.type },
    { city: ref.city },
    { type: ref.type },
  ];

  const picked: Row[] = [];
  const seen = new Set<number>([ref.id]);

  for (const ring of rings) {
    if (picked.length >= limit) break;
    const rows = await prisma.billboard.findMany({
      where:   { ...ring, status: publishedOnly, id: { notIn: [...seen] } },
      orderBy,
      take:    limit - picked.length,
    });
    for (const row of rows) {
      picked.push(row);
      seen.add(row.id);
    }
  }

  return picked.map(fromRow);
}

/** Every published media item's address and last change, for the sitemap. */
export function getPublishedSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.billboard.findMany({
    where:   { status: publishedOnly },
    select:  { slug: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
}
