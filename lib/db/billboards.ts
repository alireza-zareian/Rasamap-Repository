import type { Billboard as Row, Prisma } from "@prisma/client";
import { prisma } from "./client";
import type { Billboard, TrafficData } from "../types";

function fromRow(row: Row): Billboard {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location,
    region: row.region,
    city: row.city,
    type: row.type as Billboard["type"],
    status: row.status as Billboard["status"],
    width: row.width,
    height: row.height,
    faces: row.faces,
    age: row.age,
    price: row.price,
    priceWeekly: row.priceWeekly,
    priceQuarterly: row.priceQuarterly,
    priceYearly: row.priceYearly,
    traffic: row.traffic as unknown as TrafficData,
    mapX: row.mapX,
    mapY: row.mapY,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    icon: row.icon,
    images: row.images as unknown as string[],
    allImages: (row.allImages ?? undefined) as unknown as string[] | undefined,
    agency: row.agency,
    phone: row.phone,
    description: row.description,
    features: row.features as unknown as string[],
    nearbyLandmarks: row.nearbyLandmarks as unknown as string[],
    rating: row.rating,
    reviewCount: row.reviewCount,
    plan: row.plan,
    featured: row.featured,
    url: row.url ?? undefined,
    source: row.source ?? undefined,
    structureCode: row.structureCode ?? undefined,
    scrapedAt: row.scrapedAt ?? undefined,
  };
}

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
}

/**
 * Statuses that belong to the submission pipeline, not to a live media item.
 * A row in any of these states has not been approved for publication, so no
 * public read may return it. Exported so the stats, analytics and sitemap
 * queries share one definition instead of each repeating a literal.
 */
export const UNPUBLISHED_STATUSES = ["pending", "awaiting_payment", "rejected", "needs_revision"];

/** Prisma filter for "only rows the public may see". */
export const publishedOnly = { notIn: UNPUBLISHED_STATUSES };

// Every entry leads with `featured` (a paid, admin-granted promotion) and then
// `hasImages`, so paid listings sit at the top and photographed ones above bare
// records. `traffic_desc` and `area_desc` sort on the denormalised
// `estimatedViews` and `area` columns: both are derived values (one from the
// traffic JSON, one from width x height) and Prisma cannot ORDER BY an
// expression or a JSON path.
const SORT_MAP: Record<string, Prisma.BillboardOrderByWithRelationInput[]> = {
  price_asc:    [{ featured: "desc" }, { hasImages: "desc" }, { price: "asc" }],
  price_desc:   [{ featured: "desc" }, { hasImages: "desc" }, { price: "desc" }],
  traffic_desc: [{ featured: "desc" }, { hasImages: "desc" }, { estimatedViews: "desc" }],
  area_desc:    [{ featured: "desc" }, { hasImages: "desc" }, { area: "desc" }],
};

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
  if (p.search) {
    const s = p.search.trim();
    where.OR = [
      { name:     { contains: s } },
      { city:     { contains: s } },
      { location: { contains: s } },
      { agency:   { contains: s } },
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

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.billboard.count({ where }),
  ]);

  return { items: rows.map(fromRow), total };
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
      { name:     { contains: p.q } },
      { location: { contains: p.q } },
      // A slug, so pasting the tail of a public URL finds the row — which is
      // what "edit this listing" on the staff bar does.
      { slug:     { contains: p.q } },
    ];
  }

  const orderBy: Prisma.BillboardOrderByWithRelationInput = { [p.sortKey]: p.sortDir };

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
export async function getRelatedBillboards(ref: Billboard, limit = 12): Promise<Billboard[]> {
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

export interface BillboardCreateInput {
  name: string;
  location: string;
  city: string;
  type: string;
  price: number;
  agency: string;
  phone: string;
  description: string;
  width: number;
  height: number;
  faces: number;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Build a URL-safe slug.
 *
 * ASCII only, because `GET /api/billboards/[slug]` validates against
 * `^[a-z0-9-]+$`. The previous version kept the Persian block, so every
 * user-submitted listing got a slug that route answered with 400 — the record
 * was published but unreachable through the public API.
 *
 * Persian names therefore contribute nothing and the slug falls back to
 * `listing-<base36 timestamp>`, which matches the shape the scraper already
 * produces (`scraped-bih-63fa5bde`) and stays unique via the suffix.
 */
function slugify(name: string, suffix: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")   // any run of non-ASCII/punctuation → one dash
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");           // don't let the slice leave a trailing dash

  return `${ascii || "listing"}-${suffix}`;
}

// Fields shared by every freshly-created billboard row (manual create or a
// public listing): derived prices, the zeroed traffic block, and the neutral
// defaults for columns the creator doesn't set.
function newBillboardDefaults(name: string, monthly: number) {
  return {
    slug: slugify(name, Date.now().toString(36)),
    age: 0,
    price: monthly,
    priceWeekly: Math.round(monthly / 4),
    priceQuarterly: Math.round(monthly * 3 * 0.9),
    priceYearly: Math.round(monthly * 12 * 0.8),
    // No traffic survey exists for a hand-entered or user-submitted media item,
    // so the block stays zeroed — and estimatedViews mirrors it.
    traffic: { daily: 0, peakHour: "08:00", congestionLevel: 5, pedestrian: 0, estimatedViews: 0, viewabilityScore: 0 },
    estimatedViews: 0,
    mapX: 50,
    mapY: 50,
    icon: "🏙️",
    images: [] as string[],
    features: [] as string[],
    nearbyLandmarks: [] as string[],
    rating: 0,
    reviewCount: 0,
  };
}

export async function createBillboard(data: BillboardCreateInput): Promise<Billboard> {
  const row = await prisma.billboard.create({
    data: {
      ...newBillboardDefaults(data.name, data.price),
      name: data.name,
      location: data.location,
      region: data.city,
      city: data.city,
      type: data.type,
      status: "available",
      width: data.width,
      height: data.height,
      area: data.width * data.height,
      faces: data.faces,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      agency: data.agency,
      phone: data.phone,
      description: data.description,
      source: "manual",
    },
  });
  return fromRow(row);
}

export interface ListingCreateInput {
  name:     string;
  desc:     string;
  phone:    string;
  type:     string;
  city:     string;
  region:   string;
  location: string;
  width:    number;
  height:   number;
  faces:    number;
  price:    number;
  plan:     ListingPlan;
  images:   string[];       // already-written public URLs
  submittedById: number;
}

export type ListingPlan = "free" | "featured";

/**
 * Where a new submission starts.
 *
 * free     → `pending`: an admin only has to check the content before it goes live.
 * featured → `awaiting_payment`: the same review plus a payment an admin confirms
 *            by hand (there is no gateway; see docs/engineering-decisions.md).
 *
 * `featured` itself stays false until that confirmation, so asking for a paid
 * plan can never promote a listing on its own.
 */
export function initialListingStatus(plan: ListingPlan): string {
  return plan === "featured" ? "awaiting_payment" : "pending";
}

export async function createListing(data: ListingCreateInput): Promise<Billboard> {
  const row = await prisma.billboard.create({
    data: {
      ...newBillboardDefaults(data.name, data.price),
      name:        data.name,
      location:    data.location || data.city,
      region:      data.region || data.city,
      city:        data.city,
      type:        data.type,
      status:      initialListingStatus(data.plan),
      plan:        data.plan,
      featured:    false,
      width:       data.width,
      height:      data.height,
      area:        data.width * data.height,
      faces:       data.faces,
      agency:      "مالک مستقیم",
      phone:       data.phone,
      description: data.desc,
      source:      "listing",
      images:      data.images,
      hasImages:   data.images.length > 0,
      submittedById: data.submittedById,
    },
  });
  return fromRow(row);
}

/**
 * A submitter's own listings, in any state — powers the user dashboard.
 *
 * The full editable field set is returned (not just the summary) so a listing
 * an admin sent back for revision can be edited in place on the dashboard
 * without a second round-trip. `reviewNote` carries the admin's feedback.
 */
export async function getListingsForUser(userId: number) {
  return prisma.billboard.findMany({
    where:   { submittedById: userId },
    orderBy: { createdAt: "desc" },
    take:    50,
    select: {
      id: true, slug: true, name: true, city: true, type: true, price: true,
      status: true, plan: true, featured: true, images: true, createdAt: true,
      reviewNote: true, description: true, phone: true, region: true,
      location: true, width: true, height: true, faces: true,
    },
  });
}

export interface ListingResubmitInput {
  name:     string;
  desc:     string;
  phone:    string;
  type:     string;
  city:     string;
  region:   string;
  location: string;
  width:    number;
  height:   number;
  faces:    number;
  price:    number;
  plan:     ListingPlan;
  images:   string[];       // already-resolved public URLs (kept + newly saved)
}

/**
 * A submitter's edit of a listing an admin sent back ("needs_revision").
 *
 * Ownership and state are re-checked here, not just in the route: only the
 * account that submitted the row, and only while it is still in
 * `needs_revision`, may resubmit. The row re-enters the queue at its plan's
 * initial status, `featured` drops back to false (a new review), and the
 * review note is cleared. Returns null if the row is not the caller's or not
 * in that state. A name/city clash with the caller's other listings surfaces
 * as a Prisma P2002 for the route to translate.
 *
 * Those two conditions live in the WHERE of a single `updateMany`, not in a
 * separate read followed by a write: a bare check-then-write would let two
 * simultaneous resubmits both pass the check and both write (§8 of
 * docs/engineering-decisions.md). `count === 0` means the guard rejected it —
 * the row was not the caller's, or another request had already moved it out of
 * `needs_revision`.
 */
export async function resubmitListing(
  id: number,
  userId: number,
  data: ListingResubmitInput,
): Promise<Billboard | null> {
  const monthly = data.price;
  const { count } = await prisma.billboard.updateMany({
    where: { id, submittedById: userId, status: "needs_revision" },
    data: {
      name:           data.name,
      location:       data.location || data.city,
      region:         data.region || data.city,
      city:           data.city,
      type:           data.type,
      status:         initialListingStatus(data.plan),
      plan:           data.plan,
      featured:       false,
      width:          data.width,
      height:         data.height,
      area:           data.width * data.height,
      faces:          data.faces,
      phone:          data.phone,
      description:    data.desc,
      price:          monthly,
      priceWeekly:    Math.round(monthly / 4),
      priceQuarterly: Math.round(monthly * 3 * 0.9),
      priceYearly:    Math.round(monthly * 12 * 0.8),
      images:         data.images,
      hasImages:      data.images.length > 0,
      reviewNote:     null,
    },
  });
  if (count === 0) return null;

  const row = await prisma.billboard.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

export interface BillboardUpdateInput {
  name?: string;
  location?: string;
  city?: string;
  type?: string;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  price?: number;
  description?: string;
  agency?: string;
  phone?: string;
  width?: number;
  height?: number;
  faces?: number;
}

export async function updateBillboard(id: number, data: BillboardUpdateInput): Promise<Billboard | null> {
  try {
    // `area` is denormalised from width x height, so a size edit has to carry it
    // along. The patch is partial, so read whichever side is not being changed.
    let area: number | undefined;
    if (data.width !== undefined || data.height !== undefined) {
      const current = await prisma.billboard.findUnique({
        where: { id },
        select: { width: true, height: true },
      });
      if (!current) return null;
      area = (data.width ?? current.width) * (data.height ?? current.height);
    }

    const row = await prisma.billboard.update({
      where: { id },
      data: area === undefined ? data : { ...data, area },
    });
    return fromRow(row);
  } catch {
    return null;
  }
}

export async function deleteBillboard(id: number): Promise<boolean> {
  try {
    await prisma.billboard.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reviews reference a billboard with no cascade, so deleting a reviewed row
 * would fail deep inside Prisma and surface as an opaque 500. The admin DELETE
 * route checks this first and answers with a clear 409 instead.
 */
export async function hasReviews(id: number): Promise<boolean> {
  return (await prisma.review.count({ where: { billboardId: id } })) > 0;
}
