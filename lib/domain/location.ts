import { latinDigits } from "./digits.ts";

/**
 * A place as people hand one over — a link shared from Google Maps, Neshan,
 * Balad or OpenStreetMap, or "35.7, 51.4" — and links that open one. No map
 * picker is embedded: every provider is billed, keyed or unreachable (§32).
 */

/** The box around Iran every latitude/longitude schema reads. */
export const IRAN_LAT = { min: 24, max: 40 } as const;
export const IRAN_LNG = { min: 44, max: 64 } as const;

export type LatLng = { lat: number; lng: number };

/** Latin digits, and the Persian decimal point and comma as their Latin twins. */
function westernDigits(s: string): string {
  return latinDigits(s).replace(/٫/g, ".").replace(/،/g, ",");
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/**
 * Where each app puts the point, latitude first. Order matters: a Google link
 * carries a viewport (`@`) and the pin (`!3d…!4d…`), and the pin wins.
 */
const PATTERNS: { re: RegExp; lngFirst?: boolean }[] = [
  { re: new RegExp(String.raw`!3d${NUM}!4d${NUM}`) },                       // Google, the dropped pin
  { re: new RegExp(String.raw`[?&](?:q|ll|query|destination)=${NUM},\s*${NUM}`) }, // Google, a searched point
  { re: new RegExp(String.raw`latitude=${NUM}.*?longitude=${NUM}`) },        // Balad
  { re: new RegExp(String.raw`mlat=${NUM}.*?mlon=${NUM}`) },                 // OpenStreetMap marker
  { re: new RegExp(String.raw`#(?:map=)?\d{1,2}(?:\.\d+)?/${NUM}/${NUM}`) }, // OpenStreetMap / Balad view
  { re: new RegExp(String.raw`@${NUM},${NUM}`) },                             // Google and Neshan view
  { re: new RegExp(String.raw`^\s*${NUM}\s*[, ]\s*${NUM}\s*$`) },             // two plain numbers
];

export function isInIran(lat: number, lng: number): boolean {
  return lat >= IRAN_LAT.min && lat <= IRAN_LAT.max && lng >= IRAN_LNG.min && lng <= IRAN_LNG.max;
}

/**
 * The point in a pasted link or pair of numbers, or null if none is in Iran.
 * A swapped pair is read the right way round: no Iranian latitude exceeds 40.
 */
export function parseMapLocation(input: string): LatLng | null {
  const text = westernDigits(input.trim());
  if (!text) return null;
  for (const { re } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (isInIran(a, b)) return { lat: round(a), lng: round(b) };
    if (isInIran(b, a)) return { lat: round(b), lng: round(a) };
  }
  return null;
}

/** Six decimals: about 10 cm. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Links that open a point in the map apps people in Iran use. */
export function mapLinks({ lat, lng }: LatLng) {
  return {
    neshan: `https://neshan.org/maps/@${lat},${lng},16z,0p`,
    balad:  `https://balad.ir/location?latitude=${lat}&longitude=${lng}&zoom=16`,
    google: `https://www.google.com/maps?q=${lat},${lng}`,
  };
}
