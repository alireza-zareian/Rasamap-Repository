import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getAdminBillboardPage, createBillboard } from "@/lib/db/billboards";
import { BILLBOARD_STATUSES, BILLBOARD_TYPES } from "@/lib/types";

const SORTS = ["id_asc", "id_desc", "price_asc", "price_desc", "name_asc", "name_desc", "city_asc", "city_desc"] as const;

// GET /api/admin/billboards — every row, pipeline states included: user
// submissions land in `pending` / `awaiting_payment`, and the panel is the only
// place they can be found.
export const GET = defineRoute(
  {
    name: "admin/billboards",
    access: { staff: "viewer" },
    rateLimit: adminApiRateLimit,
    query: z.object({
      q:      z.string().max(200).default(""),
      city:   z.string().max(100).default(""),
      type:   z.enum(BILLBOARD_TYPES).or(z.literal("")).default(""),
      status: z.enum(BILLBOARD_STATUSES).or(z.literal("")).default(""),
      page:   z.coerce.number().int().min(1).max(10000).default(1),
      limit:  z.coerce.number().int().min(1).max(100).default(20),
      sort:   z.enum(SORTS).default("id_asc"),
    }),
  },
  async ({ query }) => {
    const { q, city, type, status, page, limit, sort } = query;
    const [sortKey, sortDir] = sort.split("_") as ["id" | "price" | "name" | "city", "asc" | "desc"];
    const result = await getAdminBillboardPage({
      q: q || undefined,
      city: city || undefined,
      type: type || undefined,
      status: status || undefined,
      sortKey, sortDir, page, limit,
    });
    return NextResponse.json({ ...result, page });
  },
);

// POST /api/admin/billboards — create a media item by hand (editor+).
export const POST = defineRoute(
  {
    name: "admin/billboards",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    body: z.object({
      name:        z.string().min(2).max(200),
      location:    z.string().min(3).max(300),
      city:        z.string().min(1).max(100),
      type:        z.enum(BILLBOARD_TYPES),
      price:       z.number().int().min(0),
      agency:      z.string().max(200).default(""),
      phone:       z.string().max(20).default(""),
      description: z.string().max(2000).default(""),
      width:       z.number().int().min(1).max(100).default(12),
      height:      z.number().int().min(1).max(100).default(4),
      faces:       z.number().int().min(1).max(10).default(1),
      lat:         z.number().min(24).max(40).nullish(),
      lng:         z.number().min(44).max(64).nullish(),
    }),
  },
  async ({ body, audit }) => {
    const billboard = await createBillboard(body);
    await audit("billboard_create", {
      details: { billboardId: billboard.id, name: billboard.name, type: billboard.type },
    });
    return NextResponse.json({ billboard }, { status: 201 });
  },
);
