import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * robots.txt, generated so its Sitemap line follows SITE_URL on whatever host
 * serves it. There must be no public/robots.txt: a static file would win.
 */

/** AI trainers and SEO crawlers. A request, not a control (§20) — well-behaved ones obey. */
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
        // Welcome to read the catalogue, not as fast as it can.
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
