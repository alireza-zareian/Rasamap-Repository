// Numbers for a Persian reader. The locale is named because a bare
// `toLocaleString()` uses the host's or the visitor's locale, so one build
// printed ۱۲٬۸۴۷ on one device and 12,847 on another (rule 9).

/** Format a number with Persian digits and separators (۱۲٬۸۴۷). */
export function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
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
