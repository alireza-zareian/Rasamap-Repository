// Numbers for a Persian reader. The locale is named because a bare
// `toLocaleString()` uses the host's or the visitor's locale, so one build
// printed ۱۲٬۸۴۷ on one device and 12,847 on another (rule 9).

/** Format a number with Persian digits and separators (۱۲٬۸۴۷). */
export function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
}

/**
 * A price as the catalogue stores it — millions of toman — in its short form,
 * ۴۲۸M: one spelling for every card, pin, tray and table that shows one.
 */
export function faMillions(n: number): string {
  return `${faNum(n)}M`;
}

/** Latin digits inside a string ("07:30-09:00") as Persian ones; the rest untouched. */
export function faDigits(s: string): string {
  return s.replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/**
 * A large number shortened for a tight space (۱٫۲M, ۵K). The suffixes stay
 * Latin: read as symbols, like "km", on Persian price tags too.
 */
export function faCompact(n: number): string {
  if (n >= 1_000_000) return `${faNum(Math.round(n / 100_000) / 10)}M`;
  if (n >= 1_000) return `${faNum(Math.round(n / 1_000))}K`;
  return faNum(n);
}

/**
 * An estimate, ~۱۸K, as one left-to-right island (U+2066 … U+2069). Bare, in a
 * right-to-left line, "~" is a neutral character and the bidi algorithm drew it
 * after the number — ۱۸K~ on the cards, the media page and the campaign table.
 */
export function faApprox(shortNumber: string): string {
  return `⁦~${shortNumber}⁩`;
}
