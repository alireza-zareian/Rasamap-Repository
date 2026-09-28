import "server-only";
import type { Billboard as Row, Prisma } from "@prisma/client";
import { prisma } from "../client";
import type { Availability, Billboard, BillboardType, Moderation } from "../../types";
import { distanceKm, isPlottable } from "@/lib/geo/distance";
import { searchTokens } from "@/lib/domain/search";
import { MAX_PICKED } from "@/lib/domain/campaign";
import { fromRow, published } from "./core";

/** Every read of the billboards table. Nothing here writes or invalidates. */

export interface BillboardFilterParams {
  search?: string;
  type?: BillboardType;
  availability?: Availability;
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
 * The box around a circle, in degrees. SQL cannot filter on a distance the
 * schema does not store, so a radial search narrows the table with this box and
 * cuts the exact circle from what comes back. The box may be too wide, never
 * too narrow. A degree of longitude shrinks with latitude, hence the cosine.
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
 * Rows a radial search may read before cutting the circle. The radius cap
 * already keeps the widest box to a few hundred rows; this is a backstop for a
 * denser dataset.
 */
const NEAR_SCAN_LIMIT = 3000;

// Paid promotions first, then photographed records. `estimatedViews` and `area`
// are stored columns because Prisma cannot ORDER BY a JSON path or an
// expression (§21).
//
// `id` last makes the order total: paging is LIMIT/OFFSET, and the largest
// group of equal keys is 153 rows. SQLite happens to keep ties stable,
// PostgreSQL does not promise to (§27). Measured at the same 2 ms either way.
const SORT_MAP: Record<string, Prisma.BillboardOrderByWithRelationInput[]> = {
  price_asc:    [{ featured: "desc" }, { hasImages: "desc" }, { price: "asc" },  { id: "asc" }],
  price_desc:   [{ featured: "desc" }, { hasImages: "desc" }, { price: "desc" }, { id: "asc" }],
  traffic_desc: [{ featured: "desc" }, { hasImages: "desc" }, { estimatedViews: "desc" }, { id: "asc" }],
  area_desc:    [{ featured: "desc" }, { hasImages: "desc" }, { area: "desc" }, { id: "asc" }],
};

/**
 * Each word must appear in the row's folded `searchText` (lib/domain/search.ts).
 * Both sides are folded and lower-cased, so SQLite and PostgreSQL compare alike.
 */
function searchWhere(query: string): Prisma.BillboardWhereInput[] {
  return searchTokens(query).map(token => ({ searchText: { contains: token } }));
}

function buildWhere(p: BillboardFilterParams): Prisma.BillboardWhereInput {
  // Published first, so no filter can widen a public read to a listing in review.
  const where: Prisma.BillboardWhereInput = { ...published };
  if (p.type)         where.type         = p.type;
  if (p.availability) where.availability = p.availability;
  if (p.city)      where.city   = p.city;
  else if (p.cityIn?.length) where.city = { in: p.cityIn };
  if (p.maxPrice !== undefined) where.price = { lte: p.maxPrice };
  if (p.near) {
    const box = boundingBox(p.near.lat, p.near.lng, p.near.radiusKm);
    where.lat = box.lat;
    where.lng = box.lng;
  }
  if (p.search) {
    const words = searchWhere(p.search);
    if (words.length) where.AND = words;
  }
  return where;
}

export async function getFilteredBillboards(
  p: BillboardFilterParams,
): Promise<{ items: Billboard[]; total: number }> {
  const page  = Math.max(1, p.page  ?? 1);
  // Two screens of results; a bigger page helps only bulk copying (§20).
  const limit = Math.min(48, Math.max(1, p.limit ?? 24));
  const orderBy = SORT_MAP[p.sortBy ?? ""] ?? SORT_MAP.price_asc;
  const where = buildWhere(p);

  // The circle is cut after the rows come back, so the database cannot page a
  // radial search: the box is read whole and the page taken from what is left.
  // The radius cap (MAX_RADIUS_KM) keeps that small — a 10 km box is 340 rows.
  if (p.near) {
    // First pass: only ids and coordinates, so a wide box does not drag every
    // row's JSON along (full rows cost 37 ms at the 50 km cap). Second pass:
    // whole rows for the one page shown, in the caller's order.
    const candidates = await prisma.billboard.findMany({
      where, orderBy, take: NEAR_SCAN_LIMIT,
      select: { id: true, city: true, lat: true, lng: true },
    });
    // A point far from its own city is a geocoding miss, not a board near here.
    const inside = candidates.filter(
      (r) =>
        isPlottable(r.city, r.lat, r.lng) &&
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

/** The busiest photographed media, for the landing and catalogue carousels. */
export async function getShowcaseBillboards(limit: number): Promise<Billboard[]> {
  const rows = await prisma.billboard.findMany({
    where:   { ...published, hasImages: true },
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
 * A ceiling, not a page size: the map has no next page, and without one a
 * single request could return every coordinate (§20). No city comes close.
 */
const MAP_PIN_LIMIT = 1200;

/**
 * Pins under the current filter: seven columns, not whole rows. `buildWhere`
 * is the catalogue's, so the map and the list always show the same set.
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
  // The query already excludes nulls; this narrows the type without a cast.
  return rows.flatMap((r) =>
    r.lat === null || r.lng === null ? [] : [{ ...r, lat: r.lat, lng: r.lng }],
  );
}

// The admin table: filtered, sorted and paged in the database.
export interface AdminBillboardQuery {
  q?: string;
  city?: string;
  type?: BillboardType;
  availability?: Availability;
  moderation?: Moderation;
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
  if (p.type)         where.type         = p.type;
  if (p.availability) where.availability = p.availability;
  if (p.moderation)   where.moderation   = p.moderation;
  if (p.q) {
    const words = searchWhere(p.q);
    where.OR = [
      ...(words.length ? [{ AND: words }] : []),
      // Pasting the tail of a public URL finds the row (the staff bar's "edit" link).
      { slug: { contains: p.q.trim().toLowerCase() } },
    ];
  }

  // `id` breaks ties, as in SORT_MAP: sorting by city puts hundreds of rows on one key.
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
 * One media item by slug. A listing in review is invisible unless
 * `includeUnpublished` is passed, which the media page does only after
 * checking on the server that the visitor is staff.
 */
export async function getBillboardBySlug(
  slug: string,
  { includeUnpublished = false } = {},
): Promise<Billboard | null> {
  const row = await prisma.billboard.findUnique({
    where:   { slug },
    include: { sourceRecord: { select: { scrapedAt: true } } },
  });
  if (!row) return null;
  if (!includeUnpublished && row.moderation !== published.moderation) return null;
  return fromRow(row);
}

/**
 * Published media by slug, in the order asked for; a slug that names nothing
 * public is left out. For a list someone else chose — a shared campaign — so it
 * reads at most MAX_PICKED rows whatever the caller sends.
 */
export async function getPublishedBillboardsBySlugs(slugs: readonly string[]): Promise<Billboard[]> {
  const wanted = [...new Set(slugs)].slice(0, MAX_PICKED);
  if (wanted.length === 0) return [];
  const rows = await prisma.billboard.findMany({ where: { ...published, slug: { in: wanted } } });
  const bySlug = new Map(rows.map((r) => [r.slug, fromRow(r)]));
  return wanted.flatMap((slug) => bySlug.get(slug) ?? []);
}

/** Published media by id, in the order asked for (a customer's saved list, newest first). */
export async function getPublishedBillboardsByIds(ids: readonly number[]): Promise<Billboard[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.billboard.findMany({ where: { ...published, id: { in: [...ids] } } });
  const byId = new Map(rows.map((r) => [r.id, fromRow(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Whether any row, published or not, has this slug. Checked before the cache,
 * which would otherwise keep an entry for every slug a visitor makes up.
 */
export async function slugExists(slug: string): Promise<boolean> {
  return (await prisma.billboard.count({ where: { slug } })) > 0;
}

/**
 * Suggestions under a media page, in widening rings: same city and type, then
 * same city, then same type anywhere. `region` is not used: it is free text,
 * nearly unique per row (Zanjan: 58 rows, 58 regions), so matching on it found
 * nothing and every page showed the same Tehran dozen.
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
      where:   { ...ring, ...published, id: { notIn: [...seen] } },
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
    where:   published,
    select:  { slug: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
}
