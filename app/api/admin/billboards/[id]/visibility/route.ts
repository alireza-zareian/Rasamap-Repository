import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { setBillboardVisibility } from "@/lib/db/billboards";

// POST /api/admin/billboards/[id]/visibility — take a published media item
// down, or put it back (editor+). The row, its reviews and its leads stay.
export const POST = defineRoute(
  {
    name: "admin/billboards/[id]/visibility",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({
      visible: z.boolean(),
      note:    z.string().trim().max(1000).optional(),
    }),
  },
  async ({ params, body, audit }) => {
    const { name } = await setBillboardVisibility(params.id, body.visible, body.note || null);
    await audit(body.visible ? "billboard_restored" : "billboard_suspended", {
      severity: "warn",
      details: { billboardId: params.id, name, ...(body.note ? { note: body.note } : {}) },
    });
    return NextResponse.json({ ok: true, moderation: body.visible ? "approved" : "suspended" });
  },
);
