import { z } from "zod";
// With its extension, so Node can load this file on its own for the unit tests.
import { IRAN_LAT, IRAN_LNG } from "./location.ts";
import { MobileNumber } from "./phone.ts";

/**
 * A listing is a media item a customer submitted through /list-media: a
 * billboard row plus a trip through review. These are that trip's rules, with
 * no I/O, so they are unit-tested on their own.
 */

/** Photos per listing, and the size of each. */
export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Photos an admin may put on one media item (a crawled row can have many). */
export const MAX_BILLBOARD_IMAGES = 10;

/**
 * The largest multipart body carrying `images` photos, plus room for the text
 * fields. Routes refuse more; next.config.ts lets Proxy buffer this much.
 */
export function maxUploadBodyBytes(images: number): number {
  return images * MAX_IMAGE_BYTES + 64 * 1024;
}

export const LISTING_PLANS = ["free", "featured"] as const;
export type ListingPlan = (typeof LISTING_PLANS)[number];

/**
 * Where a new or resubmitted listing starts in review:
 *
 *   free     → `pending`: staff check the content.
 *   featured → `awaiting_payment`: the same, plus a payment staff confirm by
 *              hand (no gateway, §18). Asking for the plan promotes nothing.
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
 * What a decision does to a listing awaiting one:
 *
 *   pending          --approve--> approved
 *   awaiting_payment --approve--> approved + featured
 *   either           --reject----> rejected        (never publicly reachable)
 *   either           --revision--> needs_revision  (submitter edits & resends)
 *
 * Only the review state moves; availability is a separate question. This is the
 * one place a featured slot is granted.
 */
export function decisionOutcome(decision: ListingDecision, plan: ListingPlan) {
  return {
    moderation: MODERATION_BY_DECISION[decision],
    featured:   decision === "approve" && plan === "featured",
  };
}

/** An optional coordinate from a form, where "not given" arrives as an empty string. */
function optionalCoordinate(min: number, max: number) {
  return z.preprocess(
    v => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(min, "موقعیت باید در ایران باشد").max(max, "موقعیت باید در ایران باشد").optional(),
  );
}

/**
 * What a submitter fills in — one schema for the first submission, the
 * resubmission and each wizard step, so none can drift (a lost `.trim()` once
 * let a trailing space past the unique index on (submittedById, name, city)).
 * Fields are coerced: a multipart form sends strings. Photos travel beside
 * them as files (lib/http/form.ts, lib/uploads.ts).
 */
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
  // Read from a pasted map link in the browser (parseMapLocation in
  // ./location.ts). Optional: without it the listing is just not on the map.
  lat:      optionalCoordinate(IRAN_LAT.min, IRAN_LAT.max),
  lng:      optionalCoordinate(IRAN_LNG.min, IRAN_LNG.max),
});

/**
 * Both coordinates or neither. Applied by the routes after they add the photo
 * field, because a refined schema can no longer be extended.
 */
export function coordinatesTogether(f: { lat?: number; lng?: number }): boolean {
  return (f.lat === undefined) === (f.lng === undefined);
}
export const COORDINATES_TOGETHER = { message: "موقعیت باید هر دو مختصات را داشته باشد", path: ["lat"] };

export type ListingFields = z.infer<typeof ListingFieldsSchema>;
