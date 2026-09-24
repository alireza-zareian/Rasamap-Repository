import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getBillboardById, updateBillboard, deleteBillboard } from "@/lib/db/billboards";
import { notFound } from "@/lib/domain/errors";
import { BILLBOARD_STATUSES, BILLBOARD_TYPES } from "@/lib/types";

// GET /api/admin/billboards/[id] — one record for the edit view (any staff).
export const GET = defineRoute(
  { name: "admin/billboards/[id]", access: { staff: "viewer" }, rateLimit: adminApiRateLimit, params: idParams },
  async ({ params }) => {
    const billboard = await getBillboardById(params.id);
    if (!billboard) throw notFound("بیلبورد یافت نشد");
    return NextResponse.json({ billboard });
  },
);

// PUT /api/admin/billboards/[id] — edit (editor+).
export const PUT = defineRoute(
  {
    name: "admin/billboards/[id]",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({
      name:        z.string().min(1).max(200).optional(),
      location:    z.string().max(500).optional(),
      city:        z.string().min(1).max(100).optional(),
      type:        z.enum(BILLBOARD_TYPES).optional(),
      status:      z.enum(BILLBOARD_STATUSES).optional(),
      lat:         z.number().min(24).max(40).nullable().optional(),
      lng:         z.number().min(44).max(64).nullable().optional(),
      price:       z.number().min(0).optional(),
      description: z.string().max(2000).optional(),
      agency:      z.string().max(200).optional(),
      phone:       z.string().max(50).optional(),
      width:       z.number().min(0).optional(),
      height:      z.number().min(0).optional(),
      faces:       z.number().int().min(1).optional(),
    }),
  },
  async ({ params, body, audit }) => {
    const billboard = await updateBillboard(params.id, body);
    await audit("billboard_update", { details: { billboardId: params.id, changed: Object.keys(body) } });
    return NextResponse.json({ billboard });
  },
);

// DELETE /api/admin/billboards/[id] — admin+ only.
export const DELETE = defineRoute(
  {
    name: "admin/billboards/[id]",
    access: { staff: "admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    messages: { forbidden: "فقط ادمین می‌تواند بیلبورد حذف کند" },
  },
  async ({ params, audit }) => {
    const removed = await deleteBillboard(params.id);
    await audit("billboard_delete", {
      severity: "warn",
      details: { billboardId: params.id, ...removed },
    });
    return NextResponse.json({ success: true });
  },
);
