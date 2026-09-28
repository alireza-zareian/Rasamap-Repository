import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { setCustomerPassword } from "@/lib/db/customers";
import { NewPassword } from "@/lib/domain/password";

// POST /api/admin/customers/[id]/reset-password — set the given or a generated
// password and return it once. Super admin only: whoever reads it holds the
// account, and only the audit row would show it.
export const POST = defineRoute(
  {
    name: "admin/customers/[id]/reset-password",
    access: { staff: "super_admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({ password: NewPassword.optional() }).optional(),
    messages: {
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
