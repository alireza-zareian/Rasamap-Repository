import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { createStaff, listStaff } from "@/lib/db/staff";
import { STAFF_ROLES } from "@/lib/domain/roles";

const SUPER_ONLY = { forbidden: "فقط سوپر ادمین به مدیریت کاربران دسترسی دارد" };

// GET /api/admin/users — staff accounts (super_admin only).
export const GET = defineRoute(
  { name: "admin/users", access: { staff: "super_admin" }, rateLimit: adminApiRateLimit, messages: SUPER_ONLY },
  async ({ actor }) => NextResponse.json({ admins: await listStaff(), currentId: actor.id }),
);

// POST /api/admin/users — create a staff account (super_admin only).
export const POST = defineRoute(
  {
    name: "admin/users",
    access: { staff: "super_admin" },
    rateLimit: adminApiRateLimit,
    body: z.object({
      email:    z.string().email().max(254).toLowerCase().trim(),
      name:     z.string().min(1).max(120).trim(),
      role:     z.enum(STAFF_ROLES),
      password: z.string().min(8).max(128),
    }),
    messages: { forbidden: "فقط سوپر ادمین می‌تواند کاربر بسازد" },
  },
  async ({ body, audit }) => {
    const admin = await createStaff(body);
    await audit("admin_user_create", {
      severity: "warn",
      details: { newAdminId: admin.id, email: admin.email, role: admin.role },
    });
    return NextResponse.json({ admin });
  },
);
