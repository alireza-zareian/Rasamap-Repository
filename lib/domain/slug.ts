/**
 * A media item's address from its name. Slugs are ASCII (slugParams accepts
 * `^[a-z0-9-]+$`), so Persian is written the way people type Finglish —
 * readable ("bilbord-otoban-hmt"), if not exact.
 */

const LATIN: Record<string, string> = {
  "ا": "a", "آ": "a", "أ": "a", "إ": "e", "ب": "b", "پ": "p", "ت": "t", "ث": "s",
  "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ذ": "z", "ر": "r", "ز": "z",
  "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "gh", "ک": "k", "ك": "k", "گ": "g", "ل": "l", "م": "m",
  "ن": "n", "و": "o", "ه": "h", "ة": "h", "ی": "i", "ي": "i", "ى": "i", "ئ": "y",
  "ؤ": "o", "ء": "", "ۀ": "e",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const MAX_BASE = 60;

/** `name` in Latin letters joined by dashes, then `suffix`; "listing" if nothing transliterates. */
export function slugify(name: string, suffix: string): string {
  const latin = [...name.toLowerCase()].map(ch => LATIN[ch] ?? ch).join("");
  const base = latin
    .replace(/[^a-z0-9]+/g, "-")   // any run of anything else → one dash
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/, "");           // the cut may leave a dash at the end
  return `${base || "listing"}-${suffix}`;
}
