import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * The single source for robots.txt.
 *
 * There used to be two: this file and `public/robots.txt`. A file in `public/`
 * wins over the generated route, so the rich list of rules lived in the static
 * one and this file — weaker, and missing every crawler block — was dead code
 * that nobody would notice going stale.
 *
 * The generated route is the one worth keeping, for a reason that only shows up
 * on deployment day: the static file hardcoded
 * `Sitemap: https://rasamap.ir/sitemap.xml`. Served from any other address —
 * a staging host, a free subdomain, the tunnel used to test from a phone — it
 * pointed search engines at a domain that is not the one they were reading, and
 * nothing would have reported the mistake. Here it comes from SITE_URL, the one
 * name for "where this deployment lives" (rule 9).
 */

/** Bots that take the content and give nothing back: AI trainers and SEO
 *  crawlers. Blocking them is a request, not a control — §20 is about raising
 *  the cost, not claiming immunity — but the well-behaved ones do obey. */
const UNWELCOME_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "CCBot",
  "anthropic-ai",
  "Google-Extended",
  "Bytespider",
  "PetalBot",
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
];

/** Never indexed: the API, the admin panel, and anything behind a session. */
const PRIVATE_PATHS = ["/api/", "/admin/", "/dashboard/", "/list-media/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
        // The catalogue is the product. A crawler is welcome to read it, but
        // not as fast as it can.
        crawlDelay: 10,
      },
      // The two search engines that actually send visitors get no delay.
      {
        userAgent: ["Googlebot", "Bingbot"],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      { userAgent: UNWELCOME_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
