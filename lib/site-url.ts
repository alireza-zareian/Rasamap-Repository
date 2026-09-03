/**
 * The public address of this site, for the places that need an absolute URL:
 * the sitemap, and the Open Graph image/canonical links Next.js builds from
 * `metadataBase`.
 *
 * There used to be two of these — `NEXT_PUBLIC_BASE_URL` in the sitemap and
 * `NEXT_PUBLIC_SITE_URL` in the root layout — with different fallbacks. Neither
 * was set, so the sitemap advertised the real domain while every social preview
 * pointed its image at `http://localhost:3000`: a link shared out of the app
 * looked broken to everyone except the person who built it. One name, one
 * fallback, so the two cannot drift apart again.
 *
 * Set `NEXT_PUBLIC_BASE_URL` when deploying anywhere other than rasamap.ir.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://rasamap.ir";
