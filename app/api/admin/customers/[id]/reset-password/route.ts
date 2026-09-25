import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { setCustomerPassword } from "@/lib/db/customers";

// POST /api/admin/customers/[id]/reset-password (super_admin) — set the given
// password, or a generated one, and return it once so it can be passed on.
// Super admin only: whoever reads that password back holds the account, so
// this is an account takeover that only an audit row would ever reveal.
export const POST = defineRoute(
  {
    name: "admin/customers/[id]/reset-password",
    access: { staff: "super_admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({ password: z.string().min(8).max(128).optional() }).optional(),
    messages: {
      invalidBody: "رمز عبور باید حداقل ۸ نویسه باشد",
      forbidden:   "فقط سوپر ادمین می‌تواند رمز مشتری را بازنشانی کند",
    },
  },
  async ({ params, body, audit }) => {
    const password = await setCustomerPassword(params.id, body?.password);
    await audit("customer_password_reset", {
      severity: "warn",
      details: { targetUserId: params.id, generated: !body?.password },
    });
    return NextResponse.json({ password });
  },
);
