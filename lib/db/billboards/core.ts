import "server-only";
import type { Billboard as Row, Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import type { ZodType } from "zod";
import type { Billboard, CatalogueItem, Moderation } from "../../types";
import { NO_TRAFFIC, StringListSchema, TrafficSchema } from "@/lib/domain/billboard";
import { logger } from "@/lib/logger";

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
 * Drop every cached catalogue read. Called at the end of each write that
 * changes what a visitor would see — here, in ../listings.ts and in
 * ../reviews.ts. Every caller runs inside a request, which is the context
 * revalidateTag() needs.
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

/**
 * Read a JSON column through its schema. A malformed value is logged with the
 * row and the column, and replaced by the empty value for its shape: one bad
 * row written by a script must cost that row its list of features, not the
 * whole catalogue page a 500.
 */
function jsonColumn<T>(schema: ZodType<T>, value: unknown, empty: T, id: number, column: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  logger.warn("billboard JSON column does not match its shape", { id, column });
  return empty;
}

/** A row as read, with the crawler's timestamp when the query asked for it. */
type RowWithSource = Row & { sourceRecord?: { scrapedAt: string | null } | null };

/** Prisma row → domain record. Internal to this folder; not re-exported by ./index.ts. */
export function fromRow(row: RowWithSource): Billboard {
  const { id } = row;
  return {
    id,
    name: row.name,
    slug: row.slug,
    location: row.location,
    region: row.region,
    city: row.city,
    type: row.type,
    availability: row.availability,
    moderation: row.moderation,
    width: row.width,
    height: row.height,
    faces: row.faces,
    age: row.age,
    price: row.price,
    priceWeekly: row.priceWeekly,
    priceQuarterly: row.priceQuarterly,
    priceYearly: row.priceYearly,
    traffic: jsonColumn(TrafficSchema, row.traffic, NO_TRAFFIC, id, "traffic"),
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    images: jsonColumn(StringListSchema, row.images, [], id, "images"),
    allImages: row.allImages == null ? undefined : jsonColumn(StringListSchema, row.allImages, [], id, "allImages"),
    agency: row.agency,
    phone: row.phone,
    description: row.description,
    features: jsonColumn(StringListSchema, row.features, [], id, "features"),
    nearbyLandmarks: jsonColumn(StringListSchema, row.nearbyLandmarks, [], id, "nearbyLandmarks"),
    rating: row.rating,
    reviewCount: row.reviewCount,
    plan: row.plan,
    featured: row.featured,
    source: row.source ?? undefined,
    scrapedAt: row.sourceRecord?.scrapedAt ?? undefined,
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
    type: b.type, availability: b.availability, featured: b.featured,
    price: b.price, priceYearly: b.priceYearly,
    width: b.width, height: b.height, faces: b.faces, age: b.age,
    rating: b.rating, reviewCount: b.reviewCount,
    images: b.images, allImages: b.allImages, traffic: b.traffic,
  };
}

/**
 * "Only rows the public may see", as a Prisma filter. A listing is public once
 * it has passed review; nothing else about it matters. Every public read —
 * catalogue, detail, map, stats, analytics, sitemap — spreads this into its
 * WHERE, so the rule has one spelling.
 */
export const published = { moderation: "approved" } as const satisfies Prisma.BillboardWhereInput;

/** The same rule, for a row already in hand. */
export function isPublished(moderation: Moderation): boolean {
  return moderation === "approved";
}
