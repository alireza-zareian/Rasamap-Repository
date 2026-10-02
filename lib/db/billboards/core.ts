import "server-only";
import type { Billboard as Row, Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import type { ZodType } from "zod";
import type { Billboard, CatalogueItem, Moderation } from "../../types";
import { NO_TRAFFIC, StringListSchema, TrafficSchema } from "@/lib/domain/billboard";
import { combineRatings, demoRating, type RatingSummary } from "@/lib/domain/rating";
import { logger } from "@/lib/logger";
import { isPlottable } from "@/lib/geo/distance";

/**
 * What ./queries.ts and ./mutations.ts share — the row mapper, the two public
 * narrowings, the cache tag and "published" — so neither imports the other (§34).
 */

/**
 * The cache tag for everything derived from the billboards table. ../cached.ts
 * stores under it and every write drops it, so a change shows on the next
 * refresh. Declared here so the cache depends on the data layer, not the reverse.
 */
export const CATALOGUE_TAG = "billboards";

/** Drop every cached catalogue read. Called inside a request, which revalidateTag() needs. */
export function revalidateCatalogue(): void {
  // `expire: 0`, not "max": "max" serves the stale entry once more, so staff
  // who just approved a listing would not see it on the next refresh.
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
}

/**
 * A JSON column through its schema. A malformed value is logged and replaced by
 * its empty shape, so one bad row costs that row a list, not the page a 500.
 */
function jsonColumn<T>(schema: ZodType<T>, value: unknown, empty: T, id: number, column: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  logger.warn("billboard JSON column does not match its shape", { id, column });
  return empty;
}

/**
 * Whether ratings carry a demonstration baseline (§42). The catalogue has no
 * reviews of its own yet, and an empty star slot on every card is not what the
 * product will look like; DEMO_RATINGS=off is the switch for the day it has.
 * Read once at start, so changing it needs a restart (and up to the catalogue
 * cache's five minutes).
 */
const DEMO_RATINGS = process.env.DEMO_RATINGS !== "off";

/**
 * The demonstration part of a row's rating, or none. An owner's own listing
 * gets none: it is someone's real submission, shown as it stands.
 */
function ratingBaseline(id: number, source: string | null): RatingSummary | undefined {
  return DEMO_RATINGS && source !== "listing" ? demoRating(id) : undefined;
}

/** A row as read, with the crawler's timestamp when the query asked for it. */
type RowWithSource = Row & { sourceRecord?: { scrapedAt: string | null } | null };

/** Prisma row → domain record. Internal to this folder; not re-exported by ./index.ts. */
export function fromRow(row: RowWithSource): Billboard {
  const { id } = row;
  // rating/reviewCount in the table are the reviews' own summary (lib/db/reviews.ts).
  const reviews = { rating: row.rating, count: row.reviewCount };
  const baseline = ratingBaseline(id, row.source);
  const shown = baseline ? combineRatings(baseline, reviews) : reviews;
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
    rating: shown.rating,
    reviewCount: shown.count,
    ...(baseline ? { ratingBaseline: baseline } : {}),
    plan: row.plan,
    featured: row.featured,
    source: row.source ?? undefined,
    scrapedAt: row.sourceRecord?.scrapedAt ?? undefined,
  };
}

/**
 * Strip what no browser may receive. The phone is given only one record at a
 * time, to a signed-in caller, as a lead (POST /api/billboards/[slug]/contact).
 * Every whole record sent to a client — the JSON API, a page's props — passes here.
 */
export function toPublicBillboard(b: Billboard): Billboard {
  const pub = { ...b };
  delete pub.phone;
  // About one crawled point in six is far from its own city (a Tabriz board
  // geocoded to Tehran); a point known to be wrong is not shown anywhere (§32).
  if (!isPlottable(b.city, b.lat, b.lng)) {
    delete pub.lat;
    delete pub.lng;
  }
  return pub;
}

/**
 * Narrow a record to what a card draws (CatalogueItem in lib/types.ts). The
 * field list is the guarantee: the phone is never selected.
 */
export function toCatalogueItem(b: Billboard): CatalogueItem {
  const plottable = isPlottable(b.city, b.lat, b.lng);
  return {
    id: b.id, slug: b.slug, name: b.name,
    city: b.city, region: b.region, location: b.location,
    type: b.type, availability: b.availability, featured: b.featured,
    price: b.price, priceWeekly: b.priceWeekly, priceQuarterly: b.priceQuarterly, priceYearly: b.priceYearly,
    width: b.width, height: b.height, faces: b.faces, age: b.age,
    rating: b.rating, reviewCount: b.reviewCount,
    images: b.images, allImages: b.allImages, traffic: b.traffic,
    ...(plottable ? { lat: b.lat, lng: b.lng } : {}),
  };
}

/** Rows the public may see, as a Prisma filter. Every public read spreads it into its WHERE. */
export const published = { moderation: "approved" } as const satisfies Prisma.BillboardWhereInput;

/** The same rule, for a row already in hand. */
export function isPublished(moderation: Moderation): boolean {
  return moderation === "approved";
}
