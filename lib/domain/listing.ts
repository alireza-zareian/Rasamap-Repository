import { z } from "zod";

/**
 * A listing is a media item a customer submitted through /list-media. It is a
 * Billboard row like any other, plus a trip through review before the public
 * may see it. This file holds that trip's rules — no I/O, so they can be read,
 * and tested, on their own.
 */

/** Photos per listing, and the size of each after decoding. */
export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const LISTING_PLANS = ["free", "featured"] as const;
export type ListingPlan = (typeof LISTING_PLANS)[number];

/**
 * Where a new or resubmitted listing starts in review.
 *
 * free     → `pending`: an admin only has to check the content before it goes live.
 * featured → `awaiting_payment`: the same review plus a payment an admin confirms
 *            by hand (there is no gateway; see docs/engineering-decisions.md §18).
 *
 * `featured` itself stays false until that confirmation, so asking for a paid
 * plan can never promote a listing on its own.
 */
export function initialModeration(plan: ListingPlan): "pending" | "awaiting_payment" {
  return plan === "featured" ? "awaiting_payment" : "pending";
}

export const LISTING_DECISIONS = ["approve", "reject", "revision"] as const;
export type ListingDecision = (typeof LISTING_DECISIONS)[number];

const MODERATION_BY_DECISION = {
  approve:  "approved",
  reject:   "rejected",
  revision: "needs_revision",
} as const;

/**
 * What a decision does to a listing still awaiting one:
 *
 *   pending          --approve--> approved
 *   awaiting_payment --approve--> approved + featured
 *   either           --reject----> rejected        (never publicly reachable)
 *   either           --revision--> needs_revision  (submitter edits & resends)
 *
 * A decision moves the listing's review state and nothing else — whether the
 * board is free is a separate question (its availability) that review does not
 * answer. A featured slot is granted only here, on the approval of a listing
 * that asked for one — never from the submitted plan alone.
 */
export function decisionOutcome(decision: ListingDecision, plan: ListingPlan) {
  return {
    moderation: MODERATION_BY_DECISION[decision],
    featured:   decision === "approve" && plan === "featured",
  };
}

/**
 * What a submitter fills in — the same fields on first submission and on a
 * resubmission after "needs revision", so the two cannot drift. (They did: the
 * edit schema had lost the trimming, and the partial unique index on
 * (submittedById, name, city) compares bytes, so a trailing space let a
 * near-identical listing past it.)
 *
 * `images` are data URLs for new photos; on a resubmission they may also be
 * the listing's own current URLs, for photos that are kept.
 */
export const ListingInputSchema = z.object({
  name:     z.string().trim().min(3, "نام رسانه باید حداقل ۳ کاراکتر باشد").max(100),
  desc:     z.string().max(1000).default(""),
  phone:    z.string().regex(/^09\d{9}$/, "شماره تماس معتبر نیست (مثال: 09123456789)"),
  type:     z.enum(["billboard", "digital", "bridge", "station"]),
  city:     z.string().trim().min(1, "شهر الزامی است").max(50),
  region:   z.string().max(100).default(""),
  location: z.string().max(200).default(""),
  width:    z.coerce.number().int().positive("عرض باید عدد مثبت باشد").max(200),
  height:   z.coerce.number().int().positive("ارتفاع باید عدد مثبت باشد").max(200),
  faces:    z.coerce.number().int().min(1).max(12),
  price:    z.coerce.number().int().positive("قیمت باید عدد مثبت باشد").max(10_000),
  plan:     z.enum(LISTING_PLANS).default("free"),
  // Contents are validated in lib/uploads.ts — this only bounds the count and
  // the raw string length so a huge blob is refused before it is decoded.
  images:   z.array(z.string().max(4_000_000)).max(MAX_LISTING_IMAGES).default([]),
});

export type ListingInput = z.infer<typeof ListingInputSchema>;
