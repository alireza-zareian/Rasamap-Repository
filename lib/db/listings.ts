import "server-only";
import { prisma } from "./client";
import { blankBillboardFields, revalidateCatalogue } from "./billboards";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { derivedPrices } from "@/lib/domain/pricing";
import {
  decisionOutcome, initialModeration, MAX_LISTING_IMAGES,
  type ListingDecision, type ListingFields,
} from "@/lib/domain/listing";
import { UNDECIDED } from "@/lib/domain/billboard";
import type { Moderation } from "@/lib/types";
import { discardImages, discardUploads, saveImages } from "@/lib/uploads";
import { faNum } from "@/lib/format";
import type { CustomerActor } from "@/lib/domain/actor";

/**
 * Listings from submission through review to publication. The rules are in
 * lib/domain/listing.ts; this applies them to the table and the disk.
 *
 * Every state change is a conditional write — the expected state is in the
 * update's WHERE, not in a read before it — so a double click, a retry or two
 * staff tabs cannot both write.
 */

/** A submitter's own listing: every editable field, so a revision is edited in place. */
const OWN_FIELDS = {
  id: true, slug: true, name: true, city: true, type: true, price: true,
  moderation: true, availability: true, plan: true, featured: true, images: true,
  createdAt: true, reviewNote: true, description: true, phone: true, region: true,
  location: true, width: true, height: true, faces: true, lat: true, lng: true,
} as const;

type OwnRow = Awaited<ReturnType<typeof prisma.billboard.findFirstOrThrow<{ select: typeof OWN_FIELDS }>>>;

function toOwnListing(row: OwnRow) {
  const images = (row.images as string[] | null) ?? [];
  return { ...row, images, image: images[0] ?? null };
}

/** The columns a submission writes, on first submission and on resubmission alike. */
function submittedFields(input: ListingFields) {
  return {
    name:        input.name,
    location:    input.location,
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
    lat:         input.lat ?? null,
    lng:         input.lng ?? null,
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
 * Submit a new listing, unpublished at its plan's initial state. Photos are
 * written first, so a bad image creates no row; a failed row removes them. The
 * unique index on (submittedById, name, city) stops a double submit that did
 * not send the route's Idempotency-Key.
 */
export async function submitListing(owner: CustomerActor, fields: ListingFields, photos: File[]) {
  const saved = await saveImages("listings", photos);
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
 * The submitter's edit of a listing sent back for revision. It re-enters the
 * queue at its plan's initial state, unfeatured, with the note cleared.
 * `photos` is the new list in order: this listing's own URLs, or new files.
 */
export async function resubmitListing(owner: CustomerActor, id: number, fields: ListingFields, photos: (string | File)[]) {
  const current = await prisma.billboard.findUnique({
    where:  { id },
    select: { submittedById: true, moderation: true, images: true },
  });
  // "Not found", not "forbidden", so a stranger cannot learn which ids exist.
  if (!current || current.submittedById !== owner.id) throw notFound("آگهی یافت نشد");
  if (current.moderation !== "needs_revision") {
    throw conflict("این آگهی در وضعیت «نیاز به اصلاح» نیست و قابل ویرایش نیست");
  }

  const currentUrls = (current.images as string[] | null) ?? [];
  if (photos.some(p => typeof p === "string" && !currentUrls.includes(p))) {
    throw invalid("تصویر انتخاب‌شده متعلق به این آگهی نیست");
  }
  if (photos.length > MAX_LISTING_IMAGES) {
    throw invalid(`حداکثر ${faNum(MAX_LISTING_IMAGES)} تصویر مجاز است`);
  }

  const saved = await saveImages("listings", photos.filter((p): p is File => typeof p !== "string"));
  if (!saved.ok) throw invalid(saved.error);
  const fresh = saved.urls[Symbol.iterator]();
  const finalImages = photos.map(p => (typeof p === "string" ? p : fresh.next().value as string));

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
    // Another request moved it out of `needs_revision` since the read.
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
 * Decide on a submission not yet approved (UNDECIDED), so a second click cannot
 * re-approve or re-grant a promotion. `note` replaces the submitter's feedback.
 *
 * `seen` is the updatedAt the reviewer's screen showed; the write lands only on
 * that version, so content resent while the reviewer looked is never published
 * unseen. The plan is in the same condition, for the same reason.
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
