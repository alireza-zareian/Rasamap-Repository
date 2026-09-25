import "server-only";
import { prisma } from "./client";
import { blankBillboardFields, revalidateCatalogue } from "./billboards";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { derivedPrices } from "@/lib/domain/pricing";
import {
  decisionOutcome, initialModeration, MAX_LISTING_IMAGES,
  type ListingDecision, type ListingInput,
} from "@/lib/domain/listing";
import { UNDECIDED } from "@/lib/domain/billboard";
import type { Moderation } from "@/lib/types";
import { discardImages, discardUploads, saveImages } from "@/lib/uploads";
import { faNum } from "@/lib/format";
import type { CustomerActor } from "@/lib/domain/actor";

/**
 * Listings: media items customers submit through /list-media, from submission
 * through review to publication. The rules of that trip are in
 * lib/domain/listing.ts; this file applies them to the table and to the disk.
 *
 * Every state change here is a conditional write — the state it expects is in
 * the WHERE of the update, not in a read before it — so a double-click, a
 * retried request or two admin tabs cannot both pass a check and both write
 * (audit §8).
 */

/**
 * What the submitter's dashboard shows for each of their own listings. The full
 * editable field set, not a summary, so a listing sent back for revision can be
 * edited in place without a second round-trip; `reviewNote` carries the admin's
 * feedback.
 */
const OWN_FIELDS = {
  id: true, slug: true, name: true, city: true, type: true, price: true,
  moderation: true, availability: true, plan: true, featured: true, images: true,
  createdAt: true, reviewNote: true, description: true, phone: true, region: true,
  location: true, width: true, height: true, faces: true,
} as const;

type OwnRow = Awaited<ReturnType<typeof prisma.billboard.findFirstOrThrow<{ select: typeof OWN_FIELDS }>>>;

function toOwnListing(row: OwnRow) {
  const images = (row.images as string[] | null) ?? [];
  return { ...row, images, image: images[0] ?? null };
}

/** The columns a submission writes, on first submission and on resubmission alike. */
function submittedFields(input: Omit<ListingInput, "images">) {
  return {
    name:        input.name,
    location:    input.location || input.city,
    region:      input.region || input.city,
    city:        input.city,
    type:        input.type,
    moderation:  initialModeration(input.plan),
    plan:        input.plan,
    featured:    false,
    width:       input.width,
    height:      input.height,
    area:        input.width * input.height,
    faces:       input.faces,
    phone:       input.phone,
    description: input.desc,
    ...derivedPrices(input.price),
  };
}

const DUPLICATE_MESSAGE = "این رسانه را قبلاً ثبت کرده‌اید. وضعیت آن را در داشبورد ببینید.";

export async function listOwnListings(owner: CustomerActor) {
  const rows = await prisma.billboard.findMany({
    where:   { submittedById: owner.id },
    orderBy: { createdAt: "desc" },
    take:    50,
    select:  OWN_FIELDS,
  });
  return rows.map(toOwnListing);
}

/**
 * Submit a new listing. It lands unpublished, at its plan's initial status.
 *
 * Photos are written to disk first, so a rejected image never creates a
 * half-listing; if the row then fails to write, the folder is removed again.
 * The partial unique index on (submittedById, name, city) is the floor under
 * the route's opt-in Idempotency-Key: a double-click without the header loses
 * the race here instead of creating a second listing.
 */
export async function submitListing(owner: CustomerActor, input: ListingInput) {
  const { images, ...fields } = input;
  const saved = await saveImages("listings", images);
  if (!saved.ok) throw invalid(saved.error);

  try {
    const row = await prisma.billboard.create({
      data: {
        ...blankBillboardFields(fields.name),
        ...submittedFields(fields),
        agency:        "مالک مستقیم",
        source:        "listing",
        images:        saved.urls,
        hasImages:     saved.urls.length > 0,
        submittedById: owner.id,
      },
      select: { id: true, name: true, moderation: true, plan: true },
    });
    return row;
  } catch (err) {
    await discardImages(saved.dir);
    if (isUniqueViolation(err)) throw conflict(DUPLICATE_MESSAGE);
    throw err;
  }
}

/**
 * The submitter's edit of a listing an admin sent back ("needs_revision").
 *
 * Only the account that submitted it, and only while it is still in
 * `needs_revision`. It re-enters the queue at its plan's initial status,
 * `featured` drops back to false (a new review), and the review note is
 * cleared.
 *
 * A kept photo has to be one of this listing's own current URLs — never an
 * arbitrary string a client sends. New photos arrive as data URLs.
 */
export async function resubmitListing(owner: CustomerActor, id: number, input: ListingInput) {
  const current = await prisma.billboard.findUnique({
    where:  { id },
    select: { submittedById: true, moderation: true, images: true },
  });
  // Someone else's listing is reported as missing, not forbidden: the
  // difference would tell a stranger which ids exist.
  if (!current || current.submittedById !== owner.id) throw notFound("آگهی یافت نشد");
  if (current.moderation !== "needs_revision") {
    throw conflict("این آگهی در وضعیت «نیاز به اصلاح» نیست و قابل ویرایش نیست");
  }

  const { images, ...fields } = input;
  const currentUrls = (current.images as string[] | null) ?? [];
  const kept  = images.filter(s => !s.startsWith("data:") && currentUrls.includes(s));
  const fresh = images.filter(s => s.startsWith("data:"));
  if (kept.length + fresh.length > MAX_LISTING_IMAGES) {
    throw invalid(`حداکثر ${faNum(MAX_LISTING_IMAGES)} تصویر مجاز است`);
  }

  const saved = await saveImages("listings", fresh);
  if (!saved.ok) throw invalid(saved.error);
  const finalImages = [...kept, ...saved.urls];

  let count: number;
  try {
    ({ count } = await prisma.billboard.updateMany({
      where: { id, submittedById: owner.id, moderation: "needs_revision" },
      data: {
        ...submittedFields(fields),
        images:     finalImages,
        hasImages:  finalImages.length > 0,
        reviewNote: null,
      },
    }));
  } catch (err) {
    await discardImages(saved.dir);
    if (isUniqueViolation(err)) throw conflict("این نام و شهر با آگهی دیگری از شما هم‌خوانی دارد");
    throw err;
  }
  if (count === 0) {
    // Another request moved it out of `needs_revision` between the read and
    // the write.
    await discardImages(saved.dir);
    throw conflict("این آگهی قابل ویرایش نیست");
  }

  // Photos the submitter took out of the listing are no longer anyone's.
  await discardUploads(currentUrls.filter(u => !finalImages.includes(u)));

  revalidateCatalogue();
  const row = await prisma.billboard.findUniqueOrThrow({ where: { id }, select: OWN_FIELDS });
  return toOwnListing(row);
}

/** The approval queue: submissions not yet approved, newest first. */
export async function listSubmissionQueue(filter: { moderation?: Moderation; page: number; limit: number }) {
  const { moderation, page, limit } = filter;
  const where = { moderation: moderation ?? { in: [...UNDECIDED] } };

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, city: true, region: true, location: true,
        type: true, price: true, width: true, height: true, faces: true,
        moderation: true, plan: true, featured: true, images: true,
        description: true, phone: true, createdAt: true, updatedAt: true, reviewNote: true,
        submittedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.billboard.count({ where }),
  ]);

  return {
    listings: rows.map(r => ({ ...r, images: r.images as string[] })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Decide on a submission. Only a listing not yet approved is accepted (see
 * UNDECIDED), so a second click cannot re-approve a live listing or silently
 * re-grant a paid promotion. `note` is the admin's message to the submitter,
 * shown on their dashboard; on an approval without one it clears any earlier
 * feedback.
 *
 * `seen` is the listing's updatedAt as the admin's screen showed it, and the
 * write only lands on that exact version. Checking the state alone let a
 * submitter resend new content and photos between the admin opening a listing
 * and clicking approve, and the click published what nobody had reviewed. The
 * plan the outcome was computed from is part of the same condition, so a
 * listing that dropped its paid plan cannot be granted the promotion.
 */
export async function decideListing(id: number, decision: ListingDecision, note: string | null, seen: Date) {
  const before = await prisma.billboard.findUnique({
    where:  { id },
    select: { id: true, name: true, moderation: true, plan: true, submittedById: true, updatedAt: true },
  });
  if (!before) throw notFound("آگهی یافت نشد");

  const outcome = decisionOutcome(decision, before.plan);
  const { count } = await prisma.billboard.updateMany({
    where: { id, moderation: { in: [...UNDECIDED] }, plan: before.plan, updatedAt: seen },
    data:  { ...outcome, reviewNote: note },
  });
  if (count === 0) {
    if (!(UNDECIDED as readonly string[]).includes(before.moderation)) throw conflict("این آگهی قبلاً بررسی شده است");
    throw conflict("این آگهی پس از باز کردن شما تغییر کرده است. صفحه را تازه کنید و نسخهٔ جدید را بررسی کنید.");
  }

  revalidateCatalogue();
  const after = await prisma.billboard.findUniqueOrThrow({
    where:  { id },
    select: { id: true, name: true, moderation: true, plan: true, featured: true },
  });
  return { before, after };
}
