import { AVAILABILITIES, BILLBOARD_TYPES, typeLabels, type Availability, type BillboardType } from "./types";
import { faNum } from "./format";
import { provinces, getProvince } from "@/lib/geo/iran-cities";
import type { BillboardFilterParams } from "./db/billboards";

/**
 * The catalogue's filters as they live in the URL — the one source of truth
 * for what /explore shows, so a filtered view can be shared, bookmarked and
 * indexed. The page reads it and the filter bar writes it, both through here.
 */

export const ALLOWED_SORT   = ["price_asc", "price_desc", "traffic_desc", "area_desc"] as const;

export type SortKey = (typeof ALLOWED_SORT)[number];

/**
 * How far a radial search may reach. Without a ceiling, `radiusKm=99999` would
 * read the whole country in one request past the page cap (§20). Fifty km is
 * past the edge of any Iranian city.
 */
export const MAX_RADIUS_KM = 50;
export const MIN_RADIUS_KM = 1;
/** What "near here" means before anyone touches the control. */
export const DEFAULT_RADIUS_KM = 5;

/** Price slider ceiling, in millions of toman. At the ceiling there is no cap. */
export const MAX_PRICE = 500;
export const MIN_PRICE = 10;
export const PAGE_SIZE = 24;
/** Beyond the last page of the whole catalogue; a page past the end gets the "no such page" screen. */
const MAX_PAGE = 200;

export interface ExploreFilters {
  search:   string;
  type:     BillboardType | "all";
  availability: Availability | "";
  maxPrice: number;
  sortBy:   SortKey;
  province: string;
  city:     string;
  view:     "grid" | "list";
  page:     number;
  /** A radial search, or null when the catalogue is not centred anywhere. */
  near:     { lat: number; lng: number; radiusKm: number } | null;
}

const DEFAULT_FILTERS: ExploreFilters = {
  search: "", type: "all", availability: "", maxPrice: MAX_PRICE,
  sortBy: "price_asc", province: "", city: "", view: "grid", page: 1, near: null,
};

/** A repeated parameter (`?type=a&type=b`) arrives as an array — take the first. */
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T | ""): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function intInRange(value: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * A coordinate pair from the query string, or null: both halves or neither,
 * and only real latitudes and longitudes. A bad URL gives the plain catalogue.
 */
function parseNear(
  latRaw: string, lngRaw: string, radiusRaw: string,
): ExploreFilters["near"] {
  const lat = Number.parseFloat(latRaw);
  const lng = Number.parseFloat(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    radiusKm: intInRange(radiusRaw, MIN_RADIUS_KM, MAX_RADIUS_KM, DEFAULT_RADIUS_KM),
  };
}

/**
 * A query string to filters. Every field is checked against an allowlist or a
 * range and falls back to its default, so any URL gives a valid page — and the
 * sort key, which becomes an ORDER BY, is never taken as given.
 */
export function parseExploreParams(
  sp: Record<string, string | string[] | undefined>,
): ExploreFilters {
  const province = pick(one(sp.province), provinces.map(p => p.name), "");
  const cityParam = one(sp.city).slice(0, 60);

  // `/explore?city=تهران` (a link from the landing) names no province: find it,
  // so the city dropdown opens on the right list.
  const cityOwner = cityParam
    ? provinces.find(p => p.cities.some(c => c.name === cityParam))
    : undefined;
  const resolvedProvince = province || cityOwner?.name || "";
  // A city is kept only if it belongs to the province, so the two selects agree.
  const city = cityOwner && (!province || cityOwner.name === province) ? cityParam : "";

  return {
    search:   one(sp.search).trim().slice(0, 100),
    type:     pick(one(sp.type), BILLBOARD_TYPES, "") || "all",
    availability: pick(one(sp.availability), AVAILABILITIES, ""),
    maxPrice: intInRange(one(sp.maxPrice), MIN_PRICE, MAX_PRICE, MAX_PRICE),
    sortBy:   pick(one(sp.sortBy), ALLOWED_SORT, "") || DEFAULT_FILTERS.sortBy,
    province: resolvedProvince,
    city,
    view:     one(sp.view) === "list" ? "list" : "grid",
    page:     intInRange(one(sp.page), 1, MAX_PAGE, 1),
    near:     parseNear(one(sp.lat), one(sp.lng), one(sp.radiusKm)),
  };
}

/** Filters to a database query. A province without a city becomes its list of cities. */
export function toFilterParams(f: ExploreFilters): BillboardFilterParams {
  return {
    search:   f.search || undefined,
    type:     f.type !== "all" ? f.type : undefined,
    availability: f.availability || undefined,
    city:     f.city || undefined,
    cityIn:   !f.city && f.province ? getProvince(f.province)?.cities.map(c => c.name) : undefined,
    maxPrice: f.maxPrice < MAX_PRICE ? f.maxPrice : undefined,
    sortBy:   f.sortBy,
    page:     f.page,
    limit:    PAGE_SIZE,
    near:     f.near ?? undefined,
  };
}

/**
 * Filters back to an address. Defaults are left out, so each view has exactly
 * one address: one page to index, one cache key.
 */
export function exploreHref(f: ExploreFilters, base = "/explore"): string {
  const p = new URLSearchParams();
  if (f.search)                p.set("search",   f.search);
  if (f.type !== "all")        p.set("type",     f.type);
  if (f.availability)          p.set("availability", f.availability);
  if (f.province)              p.set("province", f.province);
  if (f.city)                  p.set("city",     f.city);
  if (f.maxPrice < MAX_PRICE)  p.set("maxPrice", String(f.maxPrice));
  if (f.sortBy !== DEFAULT_FILTERS.sortBy) p.set("sortBy", f.sortBy);
  if (f.view !== "grid")       p.set("view",     f.view);
  if (f.page > 1)              p.set("page",     String(f.page));
  if (f.near) {
    // Six decimals is about 10 cm: one place, one address, one cache key.
    p.set("lat",      f.near.lat.toFixed(6));
    p.set("lng",      f.near.lng.toFixed(6));
    p.set("radiusKm", String(f.near.radiusKm));
  }
  const qs = p.toString();
  // `base` lets the map view carry the same filters to its own address.
  return qs ? `${base}?${qs}` : base;
}

/** True when the catalogue is showing anything other than everything. */
export function hasActiveFilters(f: ExploreFilters): boolean {
  return Boolean(
    f.search || f.type !== "all" || f.availability ||
    f.province || f.city || f.maxPrice < MAX_PRICE || f.near,
  );
}

/**
 * How a search engine should see this view. A type and a place make a page
 * worth indexing on its own — «بیلبورد در مشهد» is what people search for — so
 * each gets its own title. Free text, a map circle, a price or an availability
 * filter are one visitor's query, not a page: kept out of the index (followed,
 * so the media pages they list are still found). The canonical address drops
 * what only changes the presentation, the sort and the layout.
 */
export function exploreSeo(f: ExploreFilters): { title: string; canonical: string; indexable: boolean } {
  const place = f.city || f.province;
  const what = f.type !== "all" ? typeLabels[f.type] : "رسانه‌های تبلیغاتی";
  const heading = f.type === "all" && !place ? "جستجوی رسانه" : `${what} در ${place || "ایران"}`;
  const title = f.page > 1 ? `${heading} — صفحهٔ ${faNum(f.page)}` : heading;
  return {
    title,
    canonical: exploreHref({ ...f, sortBy: DEFAULT_FILTERS.sortBy, view: DEFAULT_FILTERS.view }),
    indexable: !f.search && !f.near && f.maxPrice >= MAX_PRICE && !f.availability,
  };
}
