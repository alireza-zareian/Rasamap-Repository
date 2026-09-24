import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { updateStaff } from "@/lib/db/staff";
import { STAFF_ROLES } from "@/lib/domain/roles";

// PATCH /api/admin/users/[id] — change a staff member's role or active flag
// (super_admin only; never one's own).
export const PATCH = defineRoute(
  {
    name: "admin/users/[id]",
    access: { staff: "super_admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z
      .object({ role: z.enum(STAFF_ROLES).optional(), active: z.boolean().optional() })
      .refine(d => d.role !== undefined || d.active !== undefined, { message: "تغییری ارسال نشده" }),
    messages: { forbidden: "فقط سوپر ادمین می‌تواند کاربر را تغییر دهد" },
  },
  async ({ actor, params, body, audit }) => {
    const { before, after } = await updateStaff(actor.id, params.id, body);
    await audit("admin_user_update", {
      severity: "warn",
      details: {
        targetAdminId: params.id,
        targetEmail: before.email,
        ...(body.role !== undefined ? { role: { from: before.role, to: body.role } } : {}),
        ...(body.active !== undefined ? { active: { from: before.active, to: body.active } } : {}),
      },
    });
    return NextResponse.json({ admin: after });
  },
);
