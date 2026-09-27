/**
 * A place, as people actually hand one over: a link copied from a map app, or
 * two numbers. And the links that open a place in the map apps people use.
 *
 * No map is embedded to pick a point on (every provider that could draw one is
 * billed, keyed or unreachable — §32), so the listing form and the admin form
 * take a pasted link instead. Share a location from Google Maps, Neshan, Balad
 * or OpenStreetMap, or type "35.7, 51.4", and the coordinates are read out of
 * it here.
 */

/**
 * Coordinates the catalogue accepts: a box around Iran. Every schema that
 * takes a latitude or longitude reads these.
 */
export const IRAN_LAT = { min: 24, max: 40 } as const;
export const IRAN_LNG = { min: 44, max: 64 } as const;

export type LatLng = { lat: number; lng: number };

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function westernDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/،/g, ",");
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/**
 * Where each app puts the point in its links, latitude first unless noted.
 * Order matters: a Google link carries both a viewport (`@`) and the pin
 * (`!3d…!4d…`), and the pin is the answer.
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
 * The point in a pasted link or pair of numbers, or null when there is none or
 * it is outside Iran. Two plain numbers typed the wrong way round are read the
 * right way round, since no point in Iran has a latitude above 40.
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

/** Six decimals is about ten centimetres — far past what any of these apps tells apart. */
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
