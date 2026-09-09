// One spelling of "a number, written for a Persian reader".
//
// `n.toLocaleString()` with no locale argument takes the *runtime's* locale,
// which is not a property of this app: on the server it is whatever the host
// is set to, and inside a client component it is the visitor's own browser
// setting. The same build then renders ۱۲٬۸۴۷ on a reviewer's Persian phone
// and 12,847 on the developer's English laptop — the device-dependent bug
// class in AGENTS.md rule 9, invisible on the machine the code was written on.
//
// Naming the locale fixes the output everywhere. It lives here rather than as
// a local helper per file because it had already been re-spelled three ways
// (app/page.tsx `toFa`, ScraperPanel `fa`, and ~40 inline calls), which is how
// a digit system drifts apart one screen at a time.

/** Format a number with Persian digits and separators (۱۲٬۸۴۷). */
export function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
}

/**
 * A large number shortened for a tight space (۱٫۲M, ۵K), in Persian digits.
 *
 * Two hand-rolled copies of this existed — `fmtViews` in BillboardCard and
 * `formatNum` in TrafficMeter — and both emitted Latin digits into a Persian
 * interface, so a card read "~5K نفر/روز" beside a count that read "۴ رسانه".
 * The browser tests caught it in a screenshot; no request-level assertion
 * could, because the server answered 200 and the markup was "correct".
 *
 * The M and K suffixes stay Latin on purpose: they are read as symbols here,
 * the way "km" is, and the Persian abbreviations are not in common use on
 * price tags.
 */
export function faCompact(n: number): string {
  if (n >= 1_000_000) return `${faNum(Math.round(n / 100_000) / 10)}M`;
  if (n >= 1_000) return `${faNum(Math.round(n / 1_000))}K`;
  return faNum(n);
}
