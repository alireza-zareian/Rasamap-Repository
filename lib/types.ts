// ============================================================
// RASAMAP — Core domain types + small display maps
//
// This file holds ONLY types and tiny constant maps. It must never import
// data (no scraper JSON, no billboard arrays), so that client components can
// import `typeLabels` / the `Billboard` type without dragging the static
// dataset into the browser bundle. The static dataset lives in lib/data.ts
// and is used only by prisma/seed.ts at build time.
// ============================================================

export type BillboardType = "billboard" | "digital" | "bridge" | "station" | "vehicle";

/**
 * Two questions about a media item, kept apart.
 *
 * Availability describes the board: is it free to book right now. It is shown
 * on every card and may be filtered on.
 *
 * Moderation describes the listing: has it passed review. Only `approved` is
 * ever returned by a public read. A customer's submission starts at `pending`
 * (or `awaiting_payment` on a paid plan); an admin decision moves it to
 * `approved`, `rejected` (turned down for good) or `needs_revision` (sent back
 * for the submitter to edit and resubmit).
 *
 * They used to be one `status` column, which is how an admin editing "is this
 * board busy" could set a listing to `pending`, and why every public query had
 * to carry a list of four values to exclude. Both unions are checked against
 * the Prisma enums in lib/db/billboards/core.ts.
 */
export type Availability = "available" | "busy" | "reserved" | "inactive";
export type Moderation = "pending" | "awaiting_payment" | "needs_revision" | "rejected" | "approved";
export type ListingPlan = "free" | "featured";
export type SortOption = "price_asc" | "price_desc" | "traffic_desc" | "area_desc";

export interface TrafficData {
  daily: number;          // vehicles/day
  peakHour: string;
  congestionLevel: number; // 1-10
  pedestrian: number;     // walkers/day
  estimatedViews: number; // unique ad exposures/day
  viewabilityScore: number; // 0-100
}

export interface Billboard {
  id: number;
  name: string;
  slug: string;
  location: string;
  region: string;
  city: string;
  type: BillboardType;
  availability: Availability;
  moderation: Moderation;
  width: number;
  height: number;
  faces: number;
  age: number;
  price: number;         // million toman/month
  priceWeekly: number;
  priceQuarterly: number;
  priceYearly: number;
  traffic: TrafficData;
  lat?: number;          // real coordinates — present for scraped listings that have them
  lng?: number;
  images: string[];
  allImages?: string[];  // all images across all faces — populated by DetailModal from images[]
  agency: string;
  // Optional because a Billboard that has crossed into a browser has no phone:
  // toPublicBillboard() in lib/db/billboards.ts drops it, and the number is only
  // handed out by POST /api/billboards/[slug]/contact to a signed-in caller.
  phone?: string;
  description: string;
  features: string[];
  nearbyLandmarks: string[];
  rating: number;
  reviewCount: number;
  // Monetisation: `plan` is what the submitter asked for, `featured` is what an
  // admin granted after confirming payment. Only `featured` affects ordering.
  plan: ListingPlan;
  featured: boolean;
  // Where the row came from ("billboardiha", "listing", "manual", …; absent for
  // the curated set) and, for a crawled row, when it was last read.
  source?: string;
  scrapedAt?: string;
}

/**
 * A media record as the catalogue ships it to a browser.
 *
 * Exactly the fields the cards, the compare tray and the hero carousels
 * render — nothing else. A Server Component's props travel to the browser
 * inside the RSC payload, so every field left in is a field downloaded 24
 * times per page whether or not anything draws it. Measured on /explore: the
 * full record cost 52 KB of payload, this subset costs about half that.
 *
 * Two fields are absent on purpose rather than by accident: `phone`, which is
 * never public (see toPublicBillboard), and `lat`/`lng`, because handing out
 * precise coordinates for the whole catalogue in one page is the bulk-copy
 * problem §20 of docs/engineering-decisions.md is about. The map asks for
 * those separately.
 */
export type CatalogueItem = Pick<
  Billboard,
  | "id" | "slug" | "name" | "city" | "region" | "location"
  | "type" | "availability" | "featured"
  | "price" | "priceYearly"
  | "width" | "height" | "faces" | "age"
  | "rating" | "reviewCount"
  | "images" | "allImages" | "traffic"
>;

export const typeLabels: Record<BillboardType, string> = {
  billboard: "بیلبورد",
  digital: "دیجیتال",
  bridge: "عرشه پل",
  station: "ایستگاه",
  vehicle: "وسیله نقلیه",
};

/** The type allowlist, derived from the labels so the two cannot disagree. */
export const BILLBOARD_TYPES = Object.keys(typeLabels) as [BillboardType, ...BillboardType[]];

// One label per state for the whole app — the card, the detail page, the
// analytics bars and the admin panel all read from here, so a state can never
// be spelled two ways in two places. `satisfies` makes the compiler require an
// entry for every value; the exported type stays `Record<string, string>`
// because callers index it with a plain string read back from an API.
const AVAILABILITY_LABELS = {
  available: "خالی",
  busy:      "مشغول",
  reserved:  "رزرو شده",
  inactive:  "غیرفعال",
} satisfies Record<Availability, string>;

const MODERATION_LABELS = {
  pending:          "در انتظار تأیید",
  awaiting_payment: "در انتظار پرداخت",
  needs_revision:   "نیاز به اصلاح",
  rejected:         "رد شده",
  approved:         "منتشر شده",
} satisfies Record<Moderation, string>;

export const availabilityLabels: Record<string, string> = AVAILABILITY_LABELS;
export const moderationLabels: Record<string, string> = MODERATION_LABELS;

/** The allowlists, derived from the label maps so the two cannot disagree. */
export const AVAILABILITIES = Object.keys(AVAILABILITY_LABELS) as [Availability, ...Availability[]];
export const MODERATIONS = Object.keys(MODERATION_LABELS) as [Moderation, ...Moderation[]];

export const planLabels: Record<string, string> = {
  free:     "رایگان",
  featured: "ویژه",
} satisfies Record<ListingPlan, string>;

// ── Leads ──────────────────────────────────────────────────────
// A lead is one account asking for one media owner's phone number. Since
// Rasamap hands the deal off at that point, "contacted" and "closed" describe
// the admin's own follow-up, not a state of the deal itself.
export type LeadStatus = "new" | "contacted" | "closed";

const LEAD_STATUS_LABELS = {
  new:       "جدید",
  contacted: "پیگیری شده",
  closed:    "بسته شده",
} satisfies Record<LeadStatus, string>;

export const leadStatusLabels: Record<string, string> = LEAD_STATUS_LABELS;

/** Allowlist for the admin PATCH, derived from the labels so they cannot drift. */
export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as [LeadStatus, ...LeadStatus[]];

