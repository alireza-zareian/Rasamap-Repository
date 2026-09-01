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
export type BillboardStatus = "available" | "busy" | "reserved" | "inactive";
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

