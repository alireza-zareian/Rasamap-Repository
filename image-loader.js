// ============================================================================
// RASAMAP — custom next/image loader
//
// `next/image` normally resizes on demand through /_next/image, which is real
// CPU work on the machine serving the page — the one thing §22 is about. This
// loader does no work at all: it points at files that scripts/build-image-
// variants.py already wrote to disk, so a request costs a static file read.
//
// Every source image in this project is exactly 500×500, so there is nothing
// above that to serve and no point pretending otherwise. Anything wider than
// the largest variant gets the original.
//
// The widths here, the ones in the generator, and imageSizes/deviceSizes in
// next.config.ts are one decision written in three places because each is read
// by a different tool. Change one, change all three.
// ============================================================================

/**
 * Pre-built widths, ascending. Above the last one, the original is the answer.
 *
 * A PNG has one more rung. Its top variant is the *same* 500 pixels as the
 * source, because the saving there is the container and not the size: these
 * carry real transparency, PNG stores that at about 298 KB a picture and WebP
 * at about 26. That is the one rung a high-density phone benefits from, since
 * a phone was already asking for the full 500.
 */
const VARIANTS = [256, 384];
const PNG_VARIANTS = [256, 384, 500];
const SOURCE_DIR = "/images/scraped/";

export default function rasamapImageLoader({ src, width }) {
  // Only the scraped catalogue has pre-built variants. Anything else — an
  // uploaded listing photo, an icon — is served as it is.
  if (!src.startsWith(SOURCE_DIR)) return src;

  const name = src.slice(SOURCE_DIR.length);
  const isPng = name.endsWith(".png");

  const target = (isPng ? PNG_VARIANTS : VARIANTS).find((w) => width <= w);
  if (!target) return src;

  // Every variant of a PNG is WebP — the only common format that keeps an
  // alpha channel without PNG's size.
  return `${SOURCE_DIR}w${target}/${isPng ? name.slice(0, -4) + ".webp" : name}`;
}
