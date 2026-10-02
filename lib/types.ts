// Domain types and their Persian labels. Imports no data, so a client component
// can use them without pulling the seed dataset (lib/data.ts, used only by
// prisma/seed.ts) into the browser bundle.

export type BillboardType = "billboard" | "digital" | "bridge" | "station" | "vehicle";

/**
 * Two separate questions about a media item (§35):
 *
 * Availability — is the board free right now. Shown on every card, filterable.
 *
 * Moderation — has the listing passed review. Public reads return `approved`
 * only. A submission starts `pending` (`awaiting_payment` on a paid plan);
 * staff move it to `approved`, `rejected` or `needs_revision` (sent back to
 * edit). `suspended` is a published row staff took down and can restore.
 *
 * fromRow() in lib/db/billboards/core.ts assigns the Prisma enums to these, so
 * the compiler refuses a database value a union lacks.
 */
export type Availability = "available" | "busy" | "reserved" | "inactive" | "unknown";
export type Moderation = "pending" | "awaiting_payment" | "needs_revision" | "rejected" | "approved" | "suspended";
export type ListingPlan = "free" | "featured";

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
  allImages?: string[];  // every photo across all faces, as crawled; `images` is the lead set
  agency: string;
  // Absent once a record leaves the server: toPublicBillboard() drops it, and
  // only POST /api/billboards/[slug]/contact hands it to a signed-in caller.
  phone?: string;
  description: string;
  features: string[];
  nearbyLandmarks: string[];
  /**
   * The rating a visitor is shown. While demonstration ratings are on (§42)
   * it is `ratingBaseline` combined with the real reviews; otherwise only the
   * reviews.
   */
  rating: number;
  reviewCount: number;
  /** The demonstration part of `rating`, when there is one. Never sent as structured data. */
  ratingBaseline?: { rating: number; count: number };
  // `plan` is what the submitter asked for; `featured` is what staff granted
  // after confirming payment, and the only one that affects ordering (§18).
  plan: ListingPlan;
  featured: boolean;
  // Where the row came from ("billboardiha", "listing", "manual", …; absent for
  // the curated set) and, if crawled, when it was last read.
  source?: string;
  scrapedAt?: string;
}

/**
 * A media record as the catalogue sends it to a browser: only the fields the
 * cards, the campaign planner, the results map and the carousels draw, since
 * every field travels in the RSC payload 24 times a page. No `phone` (never
 * public). `lat`/`lng` only for a point that passes isPlottable: the map view
 * (/explore/map) already publishes every such point, a province at a time, so a
 * page of 24 adds nothing a copier could not take there (§20, §40).
 */
export type CatalogueItem = Pick<
  Billboard,
  | "id" | "slug" | "name" | "city" | "region" | "location"
  | "type" | "availability" | "featured"
  | "price" | "priceWeekly" | "priceQuarterly" | "priceYearly"
  | "width" | "height" | "faces" | "age"
  | "rating" | "reviewCount"
  | "images" | "allImages" | "traffic"
  | "lat" | "lng"
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

// One label per state for the whole app. `satisfies` requires an entry for
// every value; the exported type is `Record<string, string>` because callers
// index it with strings read back from an API.
const AVAILABILITY_LABELS = {
  available: "خالی",
  busy:      "مشغول",
  reserved:  "رزرو شده",
  inactive:  "غیرفعال",
  unknown:   "استعلام از مالک",
} satisfies Record<Availability, string>;

const MODERATION_LABELS = {
  pending:          "در انتظار تأیید",
  awaiting_payment: "در انتظار پرداخت",
  needs_revision:   "نیاز به اصلاح",
  rejected:         "رد شده",
  approved:         "منتشر شده",
  suspended:        "متوقف‌شده",
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

// A lead is one account asking for one owner's phone number. The deal happens
// elsewhere, so these states track the team's own follow-up (§23).
export type LeadStatus = "new" | "contacted" | "closed";

const LEAD_STATUS_LABELS = {
  new:       "جدید",
  contacted: "پیگیری شده",
  closed:    "بسته شده",
} satisfies Record<LeadStatus, string>;

export const leadStatusLabels: Record<string, string> = LEAD_STATUS_LABELS;

/** Allowlist for the admin PATCH, derived from the labels so they cannot drift. */
export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as [LeadStatus, ...LeadStatus[]];

/** The sites crawled rows come from, credited and linked on each row's page. */
export const DATA_SOURCES: Record<string, { name: string; site: string }> = {
  billboardiha: { name: "بیلبوردیها", site: "https://billboardiha.com" },
  aradholding:  { name: "آراد هلدینگ", site: "https://aradholding.com" },
  irbillboard:  { name: "ایران بیلبورد", site: "https://irbillboard.com" },
};

/** Any row's source, in words: a crawled site's name, or how the row was made. */
export function sourceLabel(key: string | null | undefined): string {
  if (!key || key === "manual") return "ثبت دستی ادمین";
  if (key === "listing") return "ثبت‌شده توسط کاربران";
  return DATA_SOURCES[key]?.name ?? key;
}

/**
 * The account GET /api/auth/me describes, staff included. The route builds
 * its answer as this type and the browser reads it as this type, so the two
 * cannot drift apart: `id` was once sent as a string and read as a number.
 */
export interface CurrentUser {
  id: number;
  name: string;
  /** Empty for staff. */
  phone: string;
  /** Empty for a customer. */
  email: string;
  /** A staff role, or "user" for a customer. */
  role: string;
  isStaff: boolean;
}
