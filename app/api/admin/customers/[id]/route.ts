import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getCustomer, updateCustomer } from "@/lib/db/customers";

// GET /api/admin/customers/[id] — one customer + the media they submitted (admin+).
export const GET = defineRoute(
  { name: "admin/customers/[id]", access: { staff: "admin" }, rateLimit: adminApiRateLimit, params: idParams },
  async ({ params }) => NextResponse.json({ user: await getCustomer(params.id) }),
);

// PATCH /api/admin/customers/[id] — correct a name (admin+) or a number
// (super_admin; see updateCustomer).
export const PATCH = defineRoute(
  {
    name: "admin/customers/[id]",
    access: { staff: "admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z
      .object({
        name:  z.string().min(1).max(120).trim().optional(),
        phone: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست").optional(),
      })
      .refine(d => d.name !== undefined || d.phone !== undefined, { message: "تغییری ارسال نشده" }),
  },
  async ({ actor, params, body, audit }) => {
    const { before, after } = await updateCustomer(actor, params.id, body);
    await audit("customer_update", {
      severity: "warn",
      details: {
        targetUserId: params.id,
        ...(body.name !== undefined ? { name: { from: before.name, to: body.name } } : {}),
        ...(body.phone !== undefined ? { phoneChanged: body.phone !== before.phone } : {}),
      },
    });
    return NextResponse.json({ user: after });
  },
);
