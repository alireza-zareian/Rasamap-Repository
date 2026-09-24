import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { isPublished, revalidateCatalogue } from "./billboards";
import { notFound } from "@/lib/domain/errors";
import { averageRating } from "@/lib/domain/rating";
import type { Actor, CustomerActor } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";

/**
 * Reviews and the reply threads under them.
 *
 * Any signed-in customer may review a published media item, once: the unique
 * index on (billboardId, userId) is what keeps one account from inflating a
 * rating, and saveReview() upserts on it, so a second submission edits the
 * first. Rasamap does not process the transaction, so there is no purchase
 * record to gate on — pretending otherwise would be a check that verifies
 * nothing.
 */

const REPLY_FIELDS = { id: true, reviewId: true, userId: true, authorName: true, isStaff: true, body: true, createdAt: true } as const;

/**
 * `billboards.rating` / `reviewCount` are a denormalised summary of this table
 * — they are what every catalogue card and the compare table read — so every
 * write to a billboard's reviews recomputes them inside the same transaction.
 * Recomputing from an aggregate rather than incrementing keeps them right when
 * an upsert replaces a rating or a delete removes one.
 */
async function refreshRatingSummary(tx: Prisma.TransactionClient, billboardId: number): Promise<void> {
  const agg = await tx.review.aggregate({
    where:  { billboardId },
    _avg:   { rating: true },
    _count: { _all: true },
  });
  await tx.billboard.update({
    where: { id: billboardId },
    data: {
      rating:      averageRating(agg._avg.rating),
      reviewCount: agg._count._all,
    },
  });
}

/** The newest 50 reviews of a media item, each with its thread oldest-first. */
export async function listReviews(billboardId: number) {
  const reviews = await prisma.review.findMany({
    where:   { billboardId },
    include: {
      user:    { select: { name: true } },
      // Oldest first inside a thread — a conversation reads downwards, even
      // though the reviews themselves are newest-first.
      replies: { orderBy: { createdAt: "asc" }, select: REPLY_FIELDS },
    },
    orderBy: { createdAt: "desc" },
    take:    50,
  });
  const avg = reviews.length ? averageRating(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : null;
  return { reviews, avg, total: reviews.length };
}

/** Create or replace this customer's review of a published media item. */
export async function saveReview(
  author: CustomerActor,
  input: { billboardId: number; rating: number; comment: string },
) {
  const { billboardId, rating, comment } = input;

  // The media has to exist and be published — a review on an unapproved
  // listing would be invisible anyway, and this keeps an arbitrary id from
  // creating one.
  const billboard = await prisma.billboard.findUnique({ where: { id: billboardId }, select: { status: true } });
  if (!billboard || !isPublished(billboard.status)) throw notFound("رسانه یافت نشد");

  const review = await prisma.$transaction(async tx => {
    const saved = await tx.review.upsert({
      where:   { billboardId_userId: { billboardId, userId: author.id } },
      update:  { rating, comment },
      create:  { billboardId, userId: author.id, rating, comment },
      include: { user: { select: { name: true } } },
    });
    await refreshRatingSummary(tx, billboardId);
    return saved;
  });
  revalidateCatalogue();
  return review;
}

/**
 * Remove the author's own review. Someone else's is reported as missing rather
 * than forbidden: the difference would tell a stranger which ids exist.
 */
export async function deleteReview(author: CustomerActor, id: number): Promise<void> {
  const review = await prisma.review.findUnique({ where: { id }, select: { userId: true, billboardId: true } });
  if (!review || review.userId !== author.id) throw notFound("نظر یافت نشد");

  await prisma.$transaction(async tx => {
    await tx.review.delete({ where: { id } });
    await refreshRatingSummary(tx, review.billboardId);
  });
  revalidateCatalogue();
}

/**
 * Answer a review. Open to any signed-in account, customer or staff, the way a
 * comment thread works: the team needs to answer in public, not only in the
 * panel. Replies do not nest — one level keeps the thread readable and the read
 * a single join.
 *
 * A staff reply stores no customer id — `userId` is a foreign key into `users`
 * — so the author's name is written onto the reply and `isStaff` drives the
 * badge.
 */
export async function addReply(author: Actor, reviewId: number, body: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) throw notFound("نظر یافت نشد");

  const isStaff = author.kind === "staff";
  return prisma.reviewReply.create({
    data: {
      reviewId,
      userId:     isStaff ? null : author.id,
      authorName: author.name || (isStaff ? "تیم رسامپ" : "کاربر"),
      isStaff,
      body,
    },
    select: REPLY_FIELDS,
  });
}

/**
 * Remove a reply. Two people may: whoever wrote it, and an editor or above.
 * The second is moderation, not a back door — a public thread only its author
 * can clean up has no answer to an abusive reply.
 *
 * Matched on both ids, not on the reply alone, so the review in the path means
 * what it says. A reply the caller may not touch is reported as missing, for
 * the same reason a review is.
 */
export async function deleteReply(actor: Actor, reviewId: number, replyId: number): Promise<void> {
  const reply = await prisma.reviewReply.findFirst({ where: { id: replyId, reviewId }, select: { userId: true } });

  const isModerator = actor.kind === "staff" && hasRole(actor.role, "editor");
  const isAuthor = actor.kind === "customer" && reply?.userId === actor.id;
  if (!reply || (!isAuthor && !isModerator)) throw notFound("پاسخ یافت نشد");

  await prisma.reviewReply.delete({ where: { id: replyId } });
}
