import { z } from "zod";
// With its extension, so Node can load this file on its own for the unit tests.
import { IRAN_LAT, IRAN_LNG } from "./location.ts";
import { MobileNumber } from "./phone.ts";

/**
 * A listing is a media item a customer submitted through /list-media. It is a
 * Billboard row like any other, plus a trip through review before the public
 * may see it. This file holds that trip's rules — no I/O, so they can be read,
 * and tested, on their own.
 */

/** Photos per listing, and the size of each. */
export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Photos an admin may put on one media item (a crawled row can have many). */
export const MAX_BILLBOARD_IMAGES = 10;

/**
 * The largest multipart body that can carry `images` photos: the photos plus
 * room for the text fields and the multipart framing. Routes refuse anything
 * bigger before reading it, and next.config.ts lets Proxy buffer this much.
 */
export function maxUploadBodyBytes(images: number): number {
  return images * MAX_IMAGE_BYTES + 64 * 1024;
}

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
 * Every field is coerced, because it arrives in a multipart form where
 * everything is a string. The photos travel beside these fields as files and
 * are checked by the route (lib/http/form.ts) and by lib/uploads.ts.
 *
 * The wizard validates each step with the same fields, so the browser and the
 * server cannot disagree about a minimum length.
 */
/** An optional coordinate from a form, where "not given" arrives as an empty string. */
function optionalCoordinate(min: number, max: number) {
  return z.preprocess(
    v => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(min, "موقعیت باید در ایران باشد").max(max, "موقعیت باید در ایران باشد").optional(),
  );
}

export const ListingFieldsSchema = z.object({
  name:     z.string().trim().min(3, "نام رسانه باید حداقل ۳ کاراکتر باشد").max(100),
  desc:     z.string().max(1000).default(""),
  phone:    MobileNumber("شماره تماس معتبر نیست (مثال: 09123456789)"),
  type:     z.enum(["billboard", "digital", "bridge", "station"]),
  city:     z.string().trim().min(1, "شهر الزامی است").max(50),
  region:   z.string().trim().max(100).default(""),
  location: z.string().trim().min(3, "آدرس دقیق را وارد کنید (حداقل ۳ حرف)").max(200),
  width:    z.coerce.number().int().positive("عرض باید عدد مثبت باشد").max(200),
  height:   z.coerce.number().int().positive("ارتفاع باید عدد مثبت باشد").max(200),
  faces:    z.coerce.number().int().min(1).max(12),
  price:    z.coerce.number().int().positive("قیمت باید عدد مثبت باشد").max(10_000),
  plan:     z.enum(LISTING_PLANS).default("free"),
  // Where the board stands, read out of a pasted map link in the browser
  // (lib/geo/map-link.ts). Optional: without it the listing is simply not on
  // the map, as a crawled row without coordinates is not.
  lat:      optionalCoordinate(IRAN_LAT.min, IRAN_LAT.max),
  lng:      optionalCoordinate(IRAN_LNG.min, IRAN_LNG.max),
});

/**
 * Both coordinates or neither — half a point is not a location. Applied by
 * the routes after they add the photo field, since a refined schema can no
 * longer be extended.
 */
export function coordinatesTogether(f: { lat?: number; lng?: number }): boolean {
  return (f.lat === undefined) === (f.lng === undefined);
}
export const COORDINATES_TOGETHER = { message: "موقعیت باید هر دو مختصات را داشته باشد", path: ["lat"] };

export type ListingFields = z.infer<typeof ListingFieldsSchema>;
