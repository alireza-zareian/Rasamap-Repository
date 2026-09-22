import type { Billboard as Row } from "@prisma/client";
import { revalidateTag } from "next/cache";
import type { Billboard, CatalogueItem, TrafficData } from "../../types";

/**
 * The vocabulary ./queries.ts and ./mutations.ts both speak: the row mapper,
 * the two outward-facing narrowings of a record, the cache tag and the
 * definition of "published". Split out so neither half has to import the
 * other — a read must not pull the write path in behind it.
 */

/**
 * One invalidation tag for everything derived from the billboards table. The
 * cached readers in ./cached.ts store under it; the mutations below drop it, so
 * an approved listing shows up on /explore on the next refresh instead of when
 * the cache happens to expire. Declared here rather than in ./cached.ts to keep
 * the dependency one-way: the cache knows the data layer, not the reverse.
 */
export const CATALOGUE_TAG = "billboards";

/**
 * Every caller is a route handler — the request context revalidateTag() needs.
 * Exported for the handful of routes that write to the table through Prisma
 * directly (an image swap, a listing decision, a review's rating rollup)
 * instead of through the mutations below.
 */
export function revalidateCatalogue(): void {
  // `{ expire: 0 }` rather than the recommended "max" profile: "max" marks the
  // entry stale and serves it once more while it refreshes behind the visitor,
  // so an admin who has just approved a listing would still not see it on the
  // next refresh. Expiring outright makes that next read a blocking miss, which
  // is the point of calling this from a write. (The one-argument form does the
  // same thing but is deprecated in Next.js 16.)
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
}

/** Prisma row → domain record. Internal to this folder; not re-exported by ./index.ts. */
export function fromRow(row: Row): Billboard {
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

/**
 * Strip the fields no browser may receive.
 *
 * The owner/agency phone is the product: it is handed out one record at a time
 * by POST /api/billboards/[slug]/contact, to a signed-in caller, and logged as
 * a lead. Anything that ships a catalogue to a client — the JSON API, and since
 * V1 the server-rendered pages, whose props travel to the browser inside the
 * RSC payload — passes through here first, so there is one place to check.
 */
export function toPublicBillboard(b: Billboard): Billboard {
  const pub = { ...b };
  delete pub.phone;
  return pub;
}

/**
 * Narrow a record to what a catalogue card draws.
 *
 * The counterpart to toPublicBillboard for the *page* path rather than the API
 * path. The API answers with a whole record because a caller may want any part
 * of it; a card draws a fixed dozen fields, and everything else it is handed
 * gets serialised into the HTML and downloaded for nothing.
 *
 * The phone is not stripped here so much as never selected — the field list is
 * the guarantee. See CatalogueItem in lib/types.ts for what is left out and why.
 */
export function toCatalogueItem(b: Billboard): CatalogueItem {
  return {
    id: b.id, slug: b.slug, name: b.name,
    city: b.city, region: b.region, location: b.location,
    type: b.type, status: b.status, featured: b.featured,
    price: b.price, priceYearly: b.priceYearly,
    width: b.width, height: b.height, faces: b.faces, age: b.age,
    rating: b.rating, reviewCount: b.reviewCount,
    images: b.images, allImages: b.allImages, traffic: b.traffic,
  };
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
