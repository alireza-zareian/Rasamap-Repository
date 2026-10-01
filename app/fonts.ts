import localFont from "next/font/local";

/**
 * Vazirmatn, the site's one typeface, through next/font. It used to arrive as
 * a stylesheet import, so the browser found the font file only after parsing
 * that stylesheet: every page laid its text out once in a fallback face and
 * again when Vazirmatn landed — two full layouts of shaped Persian text, the
 * largest single cost of a phone's first second (traced at 4× CPU, §41). The
 * Persian file is now preloaded from the document's head.
 *
 * Two files, the variable-weight subsets the font's own package ships
 * (assets/fonts/, SIL OFL — OFL.txt): Persian, and Latin for the domain, an
 * e-mail address and the M/K suffixes. A glyph the first lacks comes from the
 * second, by ordinary fallback, so neither needs a unicode-range. No metric-
 * adjusted fallback: next/font sizes it on Arial, which has no Persian glyphs
 * on a phone, so the adjustment would be measured on the wrong letters.
 */
export const vazirFa = localFont({
  src: "../assets/fonts/vazirmatn-arabic-wght.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-fa",
  adjustFontFallback: false,
});

/** Needed on fewer lines, so fetched when the CSS asks rather than preloaded. */
export const vazirLatin = localFont({
  src: "../assets/fonts/vazirmatn-latin-wght.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-latin",
  preload: false,
  adjustFontFallback: false,
});
