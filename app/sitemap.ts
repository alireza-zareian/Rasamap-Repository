import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://rasamap.ir";

  const billboards = await prisma.billboard.findMany({
    where:  { status: { not: "pending" } },
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
