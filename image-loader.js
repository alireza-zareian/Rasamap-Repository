// The next/image loader (§22c). Instead of resizing on request through
// /_next/image, it points at files scripts/build-image-variants.py already
// wrote, so a request is a static file read. Sources are 500×500; wider
// requests get the original.
//
// These widths, the generator's and imageSizes/deviceSizes in next.config.ts
// are one decision read by three tools: change all three together.

/**
 * Pre-built widths, ascending; above the last, the original. A PNG adds a
 * 500-wide rung: the saving there is the format — its transparency costs about
 * 298 KB as PNG and 26 KB as WebP.
 */
const VARIANTS = [256, 384];
const PNG_VARIANTS = [256, 384, 500];
const SOURCE_DIR = "/images/scraped/";

export default function rasamapImageLoader({ src, width }) {
  // Only crawled photos have variants; an upload or an icon is served as is.
  if (!src.startsWith(SOURCE_DIR)) return src;

  const name = src.slice(SOURCE_DIR.length);
  const isPng = name.endsWith(".png");

  const target = (isPng ? PNG_VARIANTS : VARIANTS).find((w) => width <= w);
  if (!target) return src;

  // A PNG's variants are WebP: transparency without PNG's size.
  return `${SOURCE_DIR}w${target}/${isPng ? name.slice(0, -4) + ".webp" : name}`;
}
