import { coordsForCity, findProvinceOfCity } from "./iran-cities";

/**
 * The geometry behind the map view and the radial search. Pure arithmetic: the
 * map needs no tile server and no API key (§32).
 */

export interface Bounds {
  minLng: number; maxLng: number; minLat: number; maxLat: number;
}

/**
 * Equirectangular, longitude scaled by the cosine of the middle latitude — at
 * 32° north a degree of longitude is about 85% of one of latitude. Enough for
 * a shape a few hundred pixels wide.
 */
export function project(
  lng: number, lat: number, b: Bounds, width: number, height: number,
): { x: number; y: number } {
  const k = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const spanX = (b.maxLng - b.minLng) * k;
  const spanY = b.maxLat - b.minLat;
  // One scale for both axes, or the country stretches to fill the box.
  const s = Math.min(width / spanX, height / spanY);
  const offX = (width - spanX * s) / 2;
  const offY = (height - spanY * s) / 2;
  return {
    x: offX + (lng - b.minLng) * k * s,
    // Latitude grows northward and SVG y grows downward.
    y: offY + (b.maxLat - lat) * s,
  };
}

/** Distance in km by a flat-earth approximation: close enough over a city-sized radius. */
export function distanceKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const dLat = (aLat - bLat) * 111;
  const dLng = (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** How far from its city a pin may sit. Tehran to Karaj is about 40 km. */
export const MAX_CITY_RADIUS_KM = 40;

const IRAN = { minLng: 43, maxLng: 64, minLat: 24, maxLat: 40 };

/**
 * Whether a row's point can be believed. About one in six crawled points is far
 * from its own city (a تهران row 490 km away); the row stays in the catalogue,
 * the point stays off every map. A city with no known centre gets only the
 * country box, which still catches a swapped pair or a zero.
 */
export function isPlottable(
  city: string, lat: number | null | undefined, lng: number | null | undefined,
): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (lat < IRAN.minLat || lat > IRAN.maxLat) return false;
  if (lng < IRAN.minLng || lng > IRAN.maxLng) return false;
  const centre = coordsForCity(city);
  if (!centre) return true;
  return distanceKm(lat, lng, centre.lat, centre.lng) <= MAX_CITY_RADIUS_KM;
}

/** Per-city counts folded into provinces — from the city column, so rows without a good point still count. */
export function countByProvince(byCity: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [city, n] of Object.entries(byCity)) {
    const p = findProvinceOfCity(city);
    if (p) out[p.name] = (out[p.name] ?? 0) + n;
  }
  return out;
}
