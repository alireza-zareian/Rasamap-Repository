/**
 * The site's public address, for the sitemap and the absolute links Next builds
 * from `metadataBase`. One name and one fallback (two once disagreed, and every
 * shared link previewed from localhost). Set NEXT_PUBLIC_BASE_URL anywhere but rasamap.ir.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://rasamap.ir";
