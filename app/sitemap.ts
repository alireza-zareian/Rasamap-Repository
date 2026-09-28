import type { MetadataRoute } from "next";
import { getPublishedSlugs } from "@/lib/db/billboards";
import { SITE_URL } from "@/lib/site-url";

// Otherwise the build-time snapshot is served for ever. Hourly costs one query.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;

  const billboards = await getPublishedSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base,               lastModified: new Date(), changeFrequency: "daily",   priority: 1 },
    { url: `${base}/explore`,  lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/explore/map`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/list-media`,  lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/analytics`,   lastModified: new Date(), changeFrequency: "weekly",  priority: 0.5 },
    { url: `${base}/about`,       lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contact`,     lastModified: new Date(), changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/terms`,       lastModified: new Date(), changeFrequency: "yearly",  priority: 0.2 },
  ];

  const billboardRoutes: MetadataRoute.Sitemap = billboards.map(b => ({
    url:             `${base}/billboard/${b.slug}`,
    lastModified:    b.updatedAt,
    changeFrequency: "weekly" as const,
    priority:        0.8,
  }));

  return [...staticRoutes, ...billboardRoutes];
}
