import { AVAILABILITIES, BILLBOARD_TYPES, type Availability, type BillboardType } from "./types";
import { provinces, getProvince } from "./iranLocations";
import type { BillboardFilterParams } from "./db/billboards";

/**
 * The catalogue's filters, as they live in the URL.
 *
 * Since V1 the query string is the single source of truth for what /explore
 * shows: the page reads it on the server and queries the database with it, and
 * the filter bar writes to it. That is what makes a filtered catalogue a real
 * address — one that can be shared, bookmarked, reached with the back button,
 * and read by a search engine, none of which was true while the filters lived
 * in React state and sessionStorage.
 *
 * Both sides import this module, so a parameter has one name and one set of
 * accepted values whether it is being read or written.
 */

export const ALLOWED_SORT   = ["price_asc", "price_desc", "traffic_desc", "area_desc"] as const;

export type SortKey = (typeof ALLOWED_SORT)[number];

/**
 * How far a radial search may reach.
 *
 * A ceiling, not a preference. Without one, `radiusKm=99999` is a way to ask
 * for the whole country in a single request and walk straight past the page cap
 * §20 exists to enforce — the same hole the `limit` and `page` ceilings close.
 * Fifty kilometres is past the far edge of any Iranian city.
 */
export const MAX_RADIUS_KM = 50;
export const MIN_RADIUS_KM = 1;
/** What "near here" means before anyone touches the control. */
export const DEFAULT_RADIUS_KM = 5;

/** Price slider ceiling, in millions of toman. At the ceiling there is no cap. */
export const MAX_PRICE = 500;
export const MIN_PRICE = 10;
export const PAGE_SIZE = 24;
/** Matches the ceiling GET /api/billboards enforces — an anti-scraping limit. */
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
 * A coordinate pair from the query string, or null.
 *
 * Both halves or neither: half a centre is not a narrower search, it is a
 * meaningless one, and silently keeping the half that parsed would put the
 * visitor somewhere off the coast of Africa. Anything outside the real range of
 * a latitude or longitude is rejected the same way — a hand-edited URL yields
 * an ordinary catalogue page, never an error.
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
 * Read a URL's query string into filters.
 *
 * Total by construction: every field is checked against an allowlist or a
 * numeric range and falls back to its default, so a hand-edited or hostile URL
 * yields a valid catalogue page rather than an error. Nothing here reaches a
 * query without passing through it — the sort key in particular becomes an
 * ORDER BY, so it is never taken from the caller as given.
 */
export function parseExploreParams(
  sp: Record<string, string | string[] | undefined>,
): ExploreFilters {
  const province = pick(one(sp.province), provinces.map(p => p.name), "");
  const cityParam = one(sp.city).slice(0, 60);

  // A city with no province is how the landing page links in (`/explore?city=تهران`).
  // Resolve the province from it so the city dropdown opens on the right list.
  const cityOwner = cityParam
    ? provinces.find(p => p.cities.some(c => c.name === cityParam))
    : undefined;
  const resolvedProvince = province || cityOwner?.name || "";
  // A city is only kept when it really belongs to the province in play, so the
  // two selects can never disagree.
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

/**
 * Filters to a database query.
 *
 * A province with no city becomes the list of that province's cities, which is
 * the same translation the client used to do before calling the JSON API.
 */
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
 * Filters back to a /explore address.
 *
 * Defaults are left out, so the plain catalogue stays at `/explore` and every
 * filtered view has exactly one address — one page for a search engine to
 * index, and one cache key rather than a family of equivalent ones.
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
    // Six decimals is about ten centimetres — far past what a map click or a
    // phone's own fix can tell apart, and it keeps one place on one address
    // instead of a different cache key per trailing digit.
    p.set("lat",      f.near.lat.toFixed(6));
    p.set("lng",      f.near.lng.toFixed(6));
    p.set("radiusKm", String(f.near.radiusKm));
  }
  const qs = p.toString();
  // `base` so the map view can carry the identical filter set to its own
  // address instead of growing a second, drifting copy of this function.
  return qs ? `${base}?${qs}` : base;
}

/** True when the catalogue is showing anything other than everything. */
export function hasActiveFilters(f: ExploreFilters): boolean {
  return Boolean(
    f.search || f.type !== "all" || f.availability ||
    f.province || f.city || f.maxPrice < MAX_PRICE || f.near,
  );
}
