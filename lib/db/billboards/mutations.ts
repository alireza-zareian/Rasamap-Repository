import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../client";
import type { Availability, Billboard, BillboardType } from "../../types";
import { fromRow, revalidateCatalogue } from "./core";
import { derivedPrices } from "@/lib/domain/pricing";
import { NO_TRAFFIC } from "@/lib/domain/billboard";
import { conflict, invalid, notFound } from "@/lib/domain/errors";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { decodeImageDataUrl } from "@/lib/uploads";

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

/**
 * The columns a new row needs but its creator does not set: a slug, a zeroed
 * traffic block and empty lists. Shared by an admin create here and a
 * customer's submission in ../listings.ts, so the two cannot disagree about
 * what a blank media item looks like.
 */
export function blankBillboardFields(name: string) {
  return {
    slug: slugify(name, Date.now().toString(36)),
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
    select: { slug: true, name: true, source: true, _count: { select: { reviews: true, contactRequests: true } } },
  });
  if (!row) throw notFound("بیلبورد یافت نشد");
  if (row._count.reviews > 0) throw conflict("نمی‌توان رسانه‌ای را که نظر ثبت‌شده دارد حذف کرد");

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
  revalidateCatalogue();
  return { slug: row.slug, name: row.name, deletedLeads: row._count.contactRequests };
}

/**
 * Replace a media item's photos, in the order given.
 *
 * The list mixes two kinds of entry: URLs already on the record, kept as they
 * are, and newly picked files as data URLs — validated by their own magic bytes
 * (lib/uploads.ts), then written under public/uploads/billboards/<id>/.
 */
export async function replaceBillboardImages(id: number, entries: string[]): Promise<string[]> {
  const existing = await prisma.billboard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("بیلبورد یافت نشد");

  const dir = join(process.cwd(), "public", "uploads", "billboards", String(id));
  await mkdir(dir, { recursive: true });

  const images: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < entries.length; i++) {
    const src = entries[i];
    if (src.startsWith("/") || src.startsWith("http")) {
      images.push(src);
      continue;
    }
    const decoded = decodeImageDataUrl(src, i);
    if (!decoded.ok) throw invalid(decoded.error);
    const filename = `${stamp}-${i}.${decoded.image.ext}`;
    await writeFile(join(dir, filename), decoded.image.buffer);
    images.push(`/uploads/billboards/${id}/${filename}`);
  }

  // `hasImages` is a denormalised flag: it is the first key of the default
  // ordering on every public listing and drives the analytics coverage count,
  // so it has to move with `images` or the two drift apart.
  await prisma.billboard.update({ where: { id }, data: { images, hasImages: images.length > 0 } });
  revalidateCatalogue();
  return images;
}
