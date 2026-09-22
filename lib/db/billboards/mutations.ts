import { prisma } from "../client";
import type { Billboard } from "../../types";
import { fromRow, revalidateCatalogue } from "./core";

/**
 * Every write to the billboards table. Each one that changes what a visitor
 * would see ends by dropping the catalogue cache tag, which is why the write
 * path — and not the read path — is the side that knows about invalidation.
 */

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
  revalidateCatalogue();
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

  revalidateCatalogue();
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

    // `priceWeekly`/`priceQuarterly`/`priceYearly` are the same monthly-price
    // derivation used at creation (newBillboardDefaults) and resubmission
    // (resubmitListing) — an admin editing `price` alone must not leave the
    // other three stale next to it on the detail page.
    const derivedPrices = data.price === undefined ? undefined : {
      priceWeekly:    Math.round(data.price / 4),
      priceQuarterly: Math.round(data.price * 3 * 0.9),
      priceYearly:    Math.round(data.price * 12 * 0.8),
    };

    const row = await prisma.billboard.update({
      where: { id },
      data: { ...data, ...(area === undefined ? {} : { area }), ...derivedPrices },
    });
    revalidateCatalogue();
    return fromRow(row);
  } catch {
    return null;
  }
}

export async function deleteBillboard(id: number): Promise<boolean> {
  try {
    // A crawler row deleted here is still in tomorrow's feed, and the nightly
    // import would put it straight back (prisma/sync-scraped.ts). The tombstone
    // is the record that this absence was a decision. Rows the crawler does not
    // own — a submitted listing, a curated one — cannot come back and need none.
    const row = await prisma.billboard.findUnique({
      where: { id },
      select: { slug: true, source: true },
    });
    const crawled = row !== null && row.source !== null && row.source !== "listing";

    await prisma.$transaction(async tx => {
      await tx.billboard.delete({ where: { id } });
      if (crawled) {
        await tx.sourceTombstone.upsert({
          where:  { slug: row.slug },
          update: { reason: "admin_delete" },
          create: { slug: row.slug, reason: "admin_delete" },
        });
      }
    });
    revalidateCatalogue();
    return true;
  } catch {
    return false;
  }
}
