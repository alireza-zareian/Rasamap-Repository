import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { isPublished, revalidateCatalogue } from "./billboards";
import { forbidden, notFound } from "@/lib/domain/errors";
import { averageRating } from "@/lib/domain/rating";
import type { Actor, CustomerActor } from "@/lib/domain/actor";
import { hasRole } from "@/lib/domain/roles";

/**
 * Reviews and the reply threads under them. A customer reviews a published
 * media item once: the unique index on (billboardId, userId) holds that, and
 * saveReview() upserts on it, so a second submission edits the first. There is
 * no purchase to gate on — Rasamap does not handle the transaction.
 */

const REPLY_FIELDS = { id: true, reviewId: true, userId: true, authorName: true, isStaff: true, body: true, createdAt: true } as const;

/** Replies shown under one review. */
const REPLIES_SHOWN = 50;

/**
 * Recompute `billboards.rating` / `reviewCount` from an aggregate, inside the
 * write's transaction — right after an upsert or a delete, where incrementing
 * would drift. Returns whether the summary moved; only then is the catalogue
 * cache dropped, so editing a comment in a loop cannot keep the site uncached.
 */
async function refreshRatingSummary(tx: Prisma.TransactionClient, billboardId: number): Promise<boolean> {
  const agg = await tx.review.aggregate({
    where:  { billboardId },
    _avg:   { rating: true },
    _count: { _all: true },
  });
  const summary = { rating: averageRating(agg._avg.rating), reviewCount: agg._count._all };
  const { count } = await tx.billboard.updateMany({
    where: { id: billboardId, NOT: summary },
    data:  summary,
  });
  return count > 0;
}

/**
 * The newest 50 reviews, each with its first REPLIES_SHOWN replies, and the
 * average and count over all reviews — not over the 50, which made the header
 * disagree with the card. Both lists are capped so one busy thread cannot grow
 * every read of the page.
 */
export async function listReviews(billboardId: number) {
  const [reviews, agg] = await Promise.all([
    prisma.review.findMany({
      where:   { billboardId },
      include: {
        user:    { select: { name: true } },
        // A thread reads downwards, though reviews are newest-first.
        replies: { orderBy: { createdAt: "asc" }, take: REPLIES_SHOWN, select: REPLY_FIELDS },
      },
      orderBy: { createdAt: "desc" },
      take:    50,
    }),
    prisma.review.aggregate({ where: { billboardId }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const total = agg._count._all;
  return { reviews, avg: total ? averageRating(agg._avg.rating) : null, total };
}

/** Create or replace this customer's review of a published media item. */
export async function saveReview(
  author: CustomerActor,
  input: { billboardId: number; rating: number; comment: string },
) {
  const { billboardId, rating, comment } = input;

  // Published only: a review on a listing in review would be invisible.
  const billboard = await prisma.billboard.findUnique({ where: { id: billboardId }, select: { moderation: true, submittedById: true } });
  if (!billboard || !isPublished(billboard.moderation)) throw notFound("رسانه یافت نشد");
  // The owner may answer reviews, not rate its own listing.
  if (billboard.submittedById === author.id) throw forbidden("امکان ثبت امتیاز برای رسانه‌ای که خودتان ثبت کرده‌اید وجود ندارد");

  const { review, changed } = await prisma.$transaction(async tx => {
    const saved = await tx.review.upsert({
      where:   { billboardId_userId: { billboardId, userId: author.id } },
      update:  { rating, comment },
      create:  { billboardId, userId: author.id, rating, comment },
      include: { user: { select: { name: true } } },
    });
    return { review: saved, changed: await refreshRatingSummary(tx, billboardId) };
  });
  if (changed) revalidateCatalogue();
  return review;
}

/**
 * Remove a review: its author, or staff at editor or above (moderation).
 * Anyone else gets "not found", so a stranger cannot learn which ids exist.
 * `moderated` tells the route which deletes to audit.
 */
export async function deleteReview(actor: Actor, id: number): Promise<{ moderated: boolean; billboardId: number }> {
  const review = await prisma.review.findUnique({ where: { id }, select: { userId: true, billboardId: true } });
  const isAuthor = actor.kind === "customer" && review?.userId === actor.id;
  const isModerator = actor.kind === "staff" && hasRole(actor.role, "editor");
  if (!review || (!isAuthor && !isModerator)) throw notFound("نظر یافت نشد");

  const changed = await prisma.$transaction(async tx => {
    await tx.review.delete({ where: { id } });
    return refreshRatingSummary(tx, review.billboardId);
  });
  if (changed) revalidateCatalogue();
  return { moderated: !isAuthor, billboardId: review.billboardId };
}

/**
 * Answer a review — any signed-in account, so the team can answer in public.
 * One level, no nesting. The author is `userId` or `staffId`, with their name
 * at the time of writing; `isStaff` drives the badge.
 */
export async function addReply(author: Actor, reviewId: number, body: string) {
  const review = await prisma.review.findUnique({
    where:  { id: reviewId },
    select: { id: true, billboard: { select: { moderation: true } } },
  });
  // Same rule as saveReview: only under a published media item.
  if (!review || !isPublished(review.billboard.moderation)) throw notFound("نظر یافت نشد");

  const isStaff = author.kind === "staff";
  return prisma.reviewReply.create({
    data: {
      reviewId,
      userId:     isStaff ? null : author.id,
      staffId:    isStaff ? author.id : null,
      authorName: author.name || (isStaff ? "تیم رسامپ" : "کاربر"),
      isStaff,
      body,
    },
    select: REPLY_FIELDS,
  });
}

/**
 * Remove a reply: the customer who wrote it, or staff at editor or above. A
 * staff reply is removed by an editor. Matched on both ids, so the review in
 * the path must be the reply's own; anyone else gets "not found".
 */
export async function deleteReply(actor: Actor, reviewId: number, replyId: number): Promise<void> {
  const reply = await prisma.reviewReply.findFirst({ where: { id: replyId, reviewId }, select: { userId: true } });

  const isModerator = actor.kind === "staff" && hasRole(actor.role, "editor");
  const isAuthor = actor.kind === "customer" && reply?.userId === actor.id;
  if (!reply || (!isAuthor && !isModerator)) throw notFound("پاسخ یافت نشد");

  await prisma.reviewReply.delete({ where: { id: replyId } });
}
