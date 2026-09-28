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
 * Every admin write to the billboards table. Each one that changes what a
 * visitor sees ends by dropping the catalogue cache tag.
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
 * The columns a new row needs but its creator does not set. Shared with a
 * customer's submission (../listings.ts) so both make the same blank record.
 */
export function blankBillboardFields(name: string) {
  return {
    // Six random base-36 characters; a timestamp collided for two listings in one millisecond.
    slug: slugify(name, randomBytes(4).readUInt32BE(0).toString(36).padStart(6, "0").slice(-6)),
    age: 0,
    // No traffic survey exists for a hand-entered or submitted item.
    traffic: NO_TRAFFIC,
    estimatedViews: 0,
    images: [] as string[],
    features: [] as string[],
    nearbyLandmarks: [] as string[],
    rating: 0,
    reviewCount: 0,
    // A spread skips excess-property checks; `satisfies` catches a dropped column.
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
  const resized = data.width !== undefined || data.height !== undefined;
  try {
    const row = await prisma.$transaction(async tx => {
      const updated = await tx.billboard.update({
        where: { id },
        data: { ...data, ...(data.price === undefined ? {} : derivedPrices(data.price)) },
      });
      if (!resized) return updated;
      // `area` is stored (§21). Computed from the row this transaction just
      // wrote, so a concurrent edit of the other side cannot leave it stale.
      return tx.billboard.update({ where: { id }, data: { area: updated.width * updated.height } });
    });
    revalidateCatalogue();
    return fromRow(row);
  } catch (err) {
    if (isMissingRow(err)) throw notFound("بیلبورد یافت نشد");
    throw err;
  }
}

/**
 * Delete a media item. Refused while it has reviews, which do not cascade —
 * suspending is the answer there. Leads do cascade, so their count is returned
 * for the audit row (§23).
 *
 * A crawled row would come back with tomorrow's feed (prisma/sync-scraped.ts),
 * so deleting one leaves a tombstone; a submitted listing needs none (§33).
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
 * Take a published media item down, or put it back. The row, its reviews and
 * its leads stay; public reads stop seeing it. The update is conditional on
 * the expected state, so a double click cannot flip it twice. `note` shows on
 * the submitter's dashboard.
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
 * Replace a media item's photos, in order. Each entry is a photo the record
 * already has, or a new file. Any other string is refused, so no outside
 * address can reach the public page (../listings.ts applies the same rule).
 * New files go through saveImages(); the folder is removed if the update fails.
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
    // `hasImages` is stored: it orders the catalogue and counts photo coverage.
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
