import { coordsForCity, findProvinceOfCity } from "./iranLocations";

/**
 * The arithmetic behind the map view.
 *
 * All of it runs in the browser on rows the page already fetched, so the map
 * costs no query, no tile request and no API key — which is the whole reason it
 * is drawn from coordinates instead of embedded from a provider (§32).
 */

export interface Bounds {
  minLng: number; maxLng: number; minLat: number; maxLat: number;
}

/**
 * Equirectangular, with longitude squeezed by the cosine of the middle latitude.
 *
 * Without that factor Iran comes out visibly too wide: at 32° north a degree of
 * longitude is only about 85% of a degree of latitude on the ground. A real
 * projection would be better cartography and worse code for a shape drawn a
 * few hundred pixels wide.
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

/** Great-circle distance, flat-earth approximation — fine over one country. */
export function distanceKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const dLat = (aLat - bLat) * 111;
  const dLng = (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * How far from its city a pin may sit before we stop believing it.
 *
 * Tehran to Karaj is about 40 km, so this keeps genuine metropolitan sprawl and
 * still rejects the geocoder's misses.
 */
export const MAX_CITY_RADIUS_KM = 40;

const IRAN = { minLng: 43, maxLng: 64, minLat: 24, maxLat: 40 };

/**
 * Whether a row's coordinates can be drawn as a pin.
 *
 * Measured on the real dataset: 3,032 of 3,528 rows carry coordinates, and
 * about one in six of those sits far from the city it claims — a row labelled
 * تهران with a point 490 km away. The city and district text on those rows is
 * still right; only the point is wrong, so they stay in the catalogue and stay
 * off the map. Showing a pin we know to be misplaced is worse than showing none
 * (§5: the unhappy path is a designed screen, not an accident).
 *
 * For a city with no reference centre of its own, the box check is all there
 * is — weak, but it still catches a swapped lat/lng or a zero.
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

/**
 * Per-city counts folded up into per-province counts.
 *
 * The province shading is deliberately built from the city column and not from
 * coordinates, so it stays exact for every row — including the rows whose point
 * is wrong and the 496 that were never geocoded at all.
 */
export function countByProvince(byCity: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [city, n] of Object.entries(byCity)) {
    const p = findProvinceOfCity(city);
    if (p) out[p.name] = (out[p.name] ?? 0) + n;
  }
  return out;
}
