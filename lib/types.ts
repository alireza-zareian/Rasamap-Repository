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
// The last three are pipeline states, not descriptions of a live media item.
// A submission through /list-media is stored as "pending" (or
// "awaiting_payment" when a paid plan was chosen). An admin decision moves it
// to "rejected" (turned down for good), "needs_revision" (sent back for the
// submitter to edit and resubmit) or a published state. None of the pipeline
// states is ever returned by a public read — search, stats, sitemap, detail.
//
// "rejected" is deliberately separate from "inactive": inactive describes a
// real media item that is not currently operating and stays publicly visible,
// while a rejected submission was turned down and must not be reachable at all.
export type BillboardStatus =
  | "available" | "busy" | "reserved" | "inactive"
  | "pending" | "awaiting_payment" | "rejected" | "needs_revision";
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
  status: BillboardStatus;
  width: number;
  height: number;
  faces: number;
  age: number;
  price: number;         // million toman/month
  priceWeekly: number;
  priceQuarterly: number;
  priceYearly: number;
  traffic: TrafficData;
  mapX: number;          // % position on map
  mapY: number;
  lat?: number;          // real coordinates — present for scraped listings that have them
  lng?: number;
  icon: string;
  images: string[];
  allImages?: string[];  // all images across all faces — populated by DetailModal from images[]
  agency: string;
  phone: string;
  description: string;
  features: string[];
  nearbyLandmarks: string[];
  rating: number;
  reviewCount: number;
  // Monetisation: `plan` is what the submitter asked for, `featured` is what an
  // admin granted after confirming payment. Only `featured` affects ordering.
  plan: string;
  featured: boolean;
  // Scraper-specific fields (optional — not present on static records)
  url?: string;
  source?: string;
  structureCode?: string;
  scrapedAt?: string;
}

export const typeLabels: Record<BillboardType, string> = {
  billboard: "بیلبورد",
  digital: "دیجیتال",
  bridge: "عرشه پل",
  station: "ایستگاه",
  vehicle: "وسیله نقلیه",
};

// One label per status for the whole app — the card, the detail page, the
// analytics bars and the admin panel all read from here, so a status can never
// be spelled two ways in two places.
//
// `satisfies` makes the compiler require an entry for every BillboardStatus,
// while the exported type stays `Record<string, string>` because callers index
// it with a plain string read back from the database.
const STATUS_LABELS = {
  available:        "خالی",
  busy:             "مشغول",
  reserved:         "رزرو شده",
  inactive:         "غیرفعال",
  pending:          "در انتظار تأیید",
  awaiting_payment: "در انتظار پرداخت",
  rejected:         "رد شده",
  needs_revision:   "نیاز به اصلاح",
} satisfies Record<BillboardStatus, string>;

export const statusLabels: Record<string, string> = STATUS_LABELS;

/**
 * The canonical status allowlist, derived from the label map so the two can
 * never disagree. Admin routes validate incoming `status` values against this;
 * adding a status means adding one label above and nothing else.
 */
export const BILLBOARD_STATUSES = Object.keys(STATUS_LABELS) as BillboardStatus[];

export const planLabels: Record<string, string> = {
  free:     "رایگان",
  featured: "ویژه",
};

