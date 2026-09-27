import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../client";
import type { Availability, Billboard, BillboardType } from "../../types";
import { fromRow, revalidateCatalogue } from "./core";
import { derivedPrices } from "@/lib/domain/pricing";
import { NO_TRAFFIC } from "@/lib/domain/billboard";
import { conflict, invalid, notFound } from "@/lib/domain/errors";
import { discardImages, discardUploads, saveImages } from "@/lib/uploads";
import { slugify } from "@/lib/domain/slug";
import { randomBytes } from "node:crypto";

/**
 * Every write to the billboards table. Each one that changes what a visitor
 * would see ends by dropping the catalogue cache tag, which is why the write
 * path — and not the read path — is the side that knows about invalidation.
 */

export interface BillboardCreateInput {
  name: string;
  location: string;
  city: string;
  type: BillboardType;
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
 * The columns a new row needs but its creator does not set: a slug, a zeroed
 * traffic block and empty lists. Shared by an admin create here and a
 * customer's submission in ../listings.ts, so the two cannot disagree about
 * what a blank media item looks like.
 */
export function blankBillboardFields(name: string) {
  return {
    // Six random base-36 characters: the timestamp this used to be collided
    // for two listings made in the same millisecond, and the unique index then
    // reported the second as a duplicate of the first.
    slug: slugify(name, randomBytes(4).readUInt32BE(0).toString(36).padStart(6, "0").slice(-6)),
    age: 0,
    // No traffic survey exists for a hand-entered or user-submitted media item,
    // so the block stays zeroed — and estimatedViews mirrors it.
    traffic: NO_TRAFFIC,
    estimatedViews: 0,
    images: [] as string[],
    features: [] as string[],
    nearbyLandmarks: [] as string[],
    rating: 0,
    reviewCount: 0,
    // Checked against the table: a spread is exempt from excess-property
    // checks, so without this a dropped column survives here unnoticed.
  } satisfies Partial<Prisma.BillboardUncheckedCreateInput>;
}

export async function createBillboard(data: BillboardCreateInput): Promise<Billboard> {
  const row = await prisma.billboard.create({
    data: {
      ...blankBillboardFields(data.name),
      ...derivedPrices(data.price),
      name: data.name,
      location: data.location,
      region: data.city,
      city: data.city,
      type: data.type,
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

export interface BillboardUpdateInput {
  name?: string;
  location?: string;
  city?: string;
  type?: BillboardType;
  availability?: Availability;
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

/** Prisma's "the row to update or delete does not exist". */
function isMissingRow(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2025";
}

export async function updateBillboard(id: number, data: BillboardUpdateInput): Promise<Billboard> {
  // `area` is denormalised from width x height, so a size edit has to carry it
  // along. The patch is partial, so read whichever side is not being changed.
  let area: number | undefined;
  if (data.width !== undefined || data.height !== undefined) {
    const current = await prisma.billboard.findUnique({
      where: { id },
      select: { width: true, height: true },
    });
    if (!current) throw notFound("بیلبورد یافت نشد");
    area = (data.width ?? current.width) * (data.height ?? current.height);
  }

  try {
    const row = await prisma.billboard.update({
      where: { id },
      data: {
        ...data,
        ...(area === undefined ? {} : { area }),
        ...(data.price === undefined ? {} : derivedPrices(data.price)),
      },
    });
    revalidateCatalogue();
    return fromRow(row);
  } catch (err) {
    if (isMissingRow(err)) throw notFound("بیلبورد یافت نشد");
    throw err;
  }
}

/**
 * Delete a media item, and say what went with it.
 *
 * Refused while it has reviews: they reference the row with no cascade, and
 * losing a customer's written review to an admin's cleanup is not a side
 * effect anyone would choose. Leads, unlike reviews, cascade — a lead that
 * predates the removal has nowhere left to point — so their number is counted
 * first and returned, for the audit row, so the loss is visible after the fact
 * (the "one number worth knowing", §23).
 *
 * A crawler row deleted here is still in tomorrow's feed, and the nightly
 * import would put it straight back (prisma/sync-scraped.ts). The tombstone is
 * the record that this absence was a decision. Rows the crawler does not own —
 * a submitted listing — cannot come back and need none.
 */
export async function deleteBillboard(id: number): Promise<{ slug: string; name: string; deletedLeads: number }> {
  const row = await prisma.billboard.findUnique({
    where: { id },
    select: {
      slug: true, name: true, source: true, images: true, allImages: true,
      _count: { select: { reviews: true, contactRequests: true } },
    },
  });
  if (!row) throw notFound("بیلبورد یافت نشد");
  if (row._count.reviews > 0) throw conflict("این رسانه نظر ثبت‌شده دارد و حذف نمی‌شود؛ به‌جای حذف، انتشارش را متوقف کنید");

  const crawled = row.source !== null && row.source !== "listing";
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
  await discardUploads([...((row.images as string[] | null) ?? []), ...((row.allImages as string[] | null) ?? [])]);
  revalidateCatalogue();
  return { slug: row.slug, name: row.name, deletedLeads: row._count.contactRequests };
}

/**
 * Take a published media item down, or put a taken-down one back.
 *
 * Before this there was no way to do either: review state moved only through
 * the listing decision, which refuses an approved row, and deleting was refused
 * once a row had a review. An abusive listing with one review stayed public for
 * good. Taking it down keeps the row, its reviews and its leads; the public
 * reads simply stop seeing it (see `published`).
 *
 * Conditional on the state it expects, like every review transition, so a
 * double click cannot flip it twice. `note` is written where the submitter's
 * dashboard shows feedback.
 */
export async function setBillboardVisibility(id: number, visible: boolean, note: string | null): Promise<{ name: string }> {
  const [from, to] = visible ? ["suspended", "approved"] as const : ["approved", "suspended"] as const;
  const { count } = await prisma.billboard.updateMany({
    where: { id, moderation: from },
    data:  { moderation: to, ...(visible ? {} : { reviewNote: note }) },
  });
  if (count === 0) {
    const row = await prisma.billboard.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw notFound("بیلبورد یافت نشد");
    throw conflict(visible ? "این رسانه متوقف نشده است" : "فقط رسانهٔ منتشرشده را می‌توان متوقف کرد");
  }
  revalidateCatalogue();
  const row = await prisma.billboard.findUniqueOrThrow({ where: { id }, select: { name: true } });
  return row;
}

/**
 * Replace a media item's photos, in the order given.
 *
 * An entry is either a photo the record already has, kept as it is, or a newly
 * uploaded file. A kept photo must be one the record already has — this used
 * to keep any string starting with "/" or "http", so an arbitrary external
 * address could be stored and shown on the public page; the customer's
 * resubmission applies the same rule (../listings.ts).
 *
 * New files go through saveImages(), the same path a customer's listing takes:
 * every file is checked before any is written, and the folder is removed again
 * if the row cannot be updated.
 */
export async function replaceBillboardImages(id: number, entries: (string | File)[], max: number): Promise<string[]> {
  const existing = await prisma.billboard.findUnique({ where: { id }, select: { images: true, allImages: true } });
  if (!existing) throw notFound("بیلبورد یافت نشد");
  const current = new Set([
    ...((existing.images as string[] | null) ?? []),
    ...((existing.allImages as string[] | null) ?? []),
  ]);

  if (entries.some(e => typeof e === "string" && !current.has(e))) {
    throw invalid("تصویر انتخاب‌شده متعلق به این رسانه نیست");
  }

  const saved = await saveImages("billboards", entries.filter((e): e is File => typeof e !== "string"), max);
  if (!saved.ok) throw invalid(saved.error);

  const fresh = saved.urls[Symbol.iterator]();
  const images = entries.map(e => (typeof e === "string" ? e : fresh.next().value as string));

  try {
    // `hasImages` is a denormalised flag: it is the first key of the default
    // ordering on every public listing and drives the analytics coverage count,
    // so it has to move with `images` or the two drift apart.
    await prisma.billboard.update({ where: { id }, data: { images, hasImages: images.length > 0 } });
  } catch (err) {
    await discardImages(saved.dir);
    throw err;
  }
  // Photos taken off the record, unless the crawled gallery still lists them.
  const gallery = new Set((existing.allImages as string[] | null) ?? []);
  await discardUploads(((existing.images as string[] | null) ?? []).filter(u => !images.includes(u) && !gallery.has(u)));
  revalidateCatalogue();
  return images;
}
