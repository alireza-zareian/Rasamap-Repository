import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/client";
import { publishedOnly } from "@/lib/db/billboards";
import { SITE_URL } from "@/lib/site-url";

// Without this, Next prerenders the sitemap once at build time and serves that
// snapshot forever: a listing approved after deploy would never be indexed, and
// one that was rejected would stay listed. Hourly is far more often than the
// catalogue changes and costs one query.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;

  const billboards = await prisma.billboard.findMany({
    where:  { status: publishedOnly },
    select: { slug: true, updatedAt: true },
    orderBy: { id: "asc" },
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base,               lastModified: new Date(), changeFrequency: "daily",   priority: 1 },
    { url: `${base}/explore`,  lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/explore/map`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/list-media`,  lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  const billboardRoutes: MetadataRoute.Sitemap = billboards.map(b => ({
    url:             `${base}/billboard/${b.slug}`,
    lastModified:    b.updatedAt,
    changeFrequency: "weekly" as const,
    priority:        0.8,
  }));

  return [...staticRoutes, ...billboardRoutes];
}
