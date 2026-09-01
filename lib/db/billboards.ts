import type { Billboard as Row, Prisma } from "@prisma/client";
import { prisma } from "./client";
import type { Billboard, TrafficData } from "../types";

function fromRow(row: Row): Billboard {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location,
    region: row.region,
    city: row.city,
    type: row.type as Billboard["type"],
    status: row.status as Billboard["status"],
    width: row.width,
    height: row.height,
    faces: row.faces,
    age: row.age,
    price: row.price,
    priceWeekly: row.priceWeekly,
    priceQuarterly: row.priceQuarterly,
    priceYearly: row.priceYearly,
    traffic: row.traffic as unknown as TrafficData,
    mapX: row.mapX,
    mapY: row.mapY,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    icon: row.icon,
    images: row.images as unknown as string[],
    allImages: (row.allImages ?? undefined) as unknown as string[] | undefined,
    agency: row.agency,
    phone: row.phone,
    description: row.description,
    features: row.features as unknown as string[],
    nearbyLandmarks: row.nearbyLandmarks as unknown as string[],
    rating: row.rating,
    reviewCount: row.reviewCount,
    url: row.url ?? undefined,
    source: row.source ?? undefined,
    structureCode: row.structureCode ?? undefined,
    scrapedAt: row.scrapedAt ?? undefined,
  };
}

export async function getAllBillboards(): Promise<Billboard[]> {
  const rows = await prisma.billboard.findMany({ orderBy: [{ hasImages: "desc" }, { id: "asc" }] });
  return rows.map(fromRow);
}

export interface BillboardFilterParams {
  search?: string;
  type?: string;
  status?: string;
  city?: string;
  cityIn?: string[];   // province-level: all cities in that province
  maxPrice?: number;
  sortBy?: string;
  page?: number;
  limit?: number;
}

const SORT_MAP: Record<string, Prisma.BillboardOrderByWithRelationInput[]> = {
  price_asc:    [{ hasImages: "desc" }, { price: "asc" }],
  price_desc:   [{ hasImages: "desc" }, { price: "desc" }],
  rating_desc:  [{ hasImages: "desc" }, { rating: "desc" }],
  traffic_desc: [{ hasImages: "desc" }, { rating: "desc" }],
  area_desc:    [{ hasImages: "desc" }, { width: "desc" }],
};

function buildWhere(p: BillboardFilterParams): Prisma.BillboardWhereInput {
  const where: Prisma.BillboardWhereInput = {};
  if (p.type)      where.type   = p.type;
  if (p.status)    where.status = p.status;
  else             where.status = { not: "pending" }; // pending listings are not publicly visible
  if (p.city)      where.city   = p.city;
  else if (p.cityIn?.length) where.city = { in: p.cityIn };
  if (p.maxPrice !== undefined) where.price = { lte: p.maxPrice };
  if (p.search) {
    const s = p.search.trim();
    where.OR = [
      { name:     { contains: s } },
      { city:     { contains: s } },
      { location: { contains: s } },
      { agency:   { contains: s } },
    ];
  }
  return where;
}

export async function getFilteredBillboards(
  p: BillboardFilterParams,
): Promise<{ items: Billboard[]; total: number }> {
  const page  = Math.max(1, p.page  ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 24));
  const orderBy = SORT_MAP[p.sortBy ?? ""] ?? [{ hasImages: "desc" as const }, { price: "asc" as const }];
  const where = buildWhere(p);

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.billboard.count({ where }),
  ]);

  return { items: rows.map(fromRow), total };
}

export async function getBillboardById(id: number): Promise<Billboard | null> {
  const row = await prisma.billboard.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

export async function getBillboardBySlug(slug: string): Promise<Billboard | null> {
  const row = await prisma.billboard.findUnique({ where: { slug } });
  return row ? fromRow(row) : null;
}

export async function countBillboards(): Promise<number> {
  return prisma.billboard.count();
}

export interface BillboardCreateInput {
  name: string;
  location: string;
  city: string;
  type: string;
  price: number;
  agency: string;
  phone: string;
  description: string;
  width: number;
  height: number;
  faces: number;
  lat?: number | null;
  lng?: number | null;
}

function slugify(name: string, suffix: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^\w؀-ۿ-]/g, "")
    .slice(0, 60)
    .toLowerCase() + "-" + suffix;
}

export async function createBillboard(data: BillboardCreateInput): Promise<Billboard> {
  const suffix = Date.now().toString(36);
  const slug = slugify(data.name, suffix);
  const monthly = data.price;
  const row = await prisma.billboard.create({
    data: {
      name: data.name,
      slug,
      location: data.location,
      region: data.city,
      city: data.city,
      type: data.type,
      status: "available",
      width: data.width,
      height: data.height,
      faces: data.faces,
      age: 0,
      price: monthly,
      priceWeekly: Math.round(monthly / 4),
      priceQuarterly: Math.round(monthly * 3 * 0.9),
      priceYearly: Math.round(monthly * 12 * 0.8),
      traffic: { daily: 0, peakHour: "08:00", congestionLevel: 5, pedestrian: 0, estimatedViews: 0, viewabilityScore: 0 },
      mapX: 50,
      mapY: 50,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      icon: "🏙️",
      images: [],
      agency: data.agency,
      phone: data.phone,
      description: data.description,
      features: [],
      nearbyLandmarks: [],
      rating: 0,
      reviewCount: 0,
      source: "manual",
    },
  });
  return fromRow(row);
}

export interface ListingCreateInput {
  name:     string;
  desc:     string;
  phone:    string;
  type:     string;
  city:     string;
  region:   string;
  location: string;
  width:    number;
  height:   number;
  faces:    number;
  price:    number;
}

export async function createListing(data: ListingCreateInput): Promise<Billboard> {
  const suffix = Date.now().toString(36);
  const slug = slugify(data.name, suffix);
  const monthly = data.price;
  const row = await prisma.billboard.create({
    data: {
      name:           data.name,
      slug,
      location:       data.location || data.city,
      region:         data.region || data.city,
      city:           data.city,
      type:           data.type,
      status:         "pending",
      width:          data.width,
      height:         data.height,
      faces:          data.faces,
      age:            0,
      price:          monthly,
      priceWeekly:    Math.round(monthly / 4),
      priceQuarterly: Math.round(monthly * 3 * 0.9),
      priceYearly:    Math.round(monthly * 12 * 0.8),
      traffic:        { daily: 0, peakHour: "08:00", congestionLevel: 5, pedestrian: 0, estimatedViews: 0, viewabilityScore: 0 },
      mapX:           50,
      mapY:           50,
      icon:           "🏙️",
      images:         [],
      agency:         "مالک مستقیم",
      phone:          data.phone,
      description:    data.desc,
      features:       [],
      nearbyLandmarks:[],
      rating:         0,
      reviewCount:    0,
      source:         "listing",
    },
  });
  return fromRow(row);
}

export async function getListingsByStatus(status: string): Promise<Billboard[]> {
  const rows = await prisma.billboard.findMany({
    where: { status, source: "listing" },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(fromRow);
}

export interface BillboardUpdateInput {
  name?: string;
  location?: string;
  city?: string;
  type?: string;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  price?: number;
  description?: string;
  agency?: string;
  phone?: string;
  width?: number;
  height?: number;
  faces?: number;
}

export async function updateBillboard(id: number, data: BillboardUpdateInput): Promise<Billboard | null> {
  try {
    const row = await prisma.billboard.update({ where: { id }, data });
    return fromRow(row);
  } catch {
    return null;
  }
}

export async function deleteBillboard(id: number): Promise<boolean> {
  try {
    await prisma.billboard.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function hasActiveReservations(id: number): Promise<boolean> {
  const count = await prisma.reservation.count({
    where: {
      billboardId: id,
      status: { in: ["pending", "confirmed"] },
    },
  });
  return count > 0;
}
