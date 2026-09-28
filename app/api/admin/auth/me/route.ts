import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit, adminLoginAttempt, resetAccountAttempts } from "@/lib/rate-limit";
import { changeOwnStaffPassword } from "@/lib/db/staff";
import { GivenPassword, NewPassword } from "@/lib/domain/password";

// GET /api/admin/auth/me — the signed-in staff member, safe fields only.
export const GET = defineRoute(
  { name: "admin/auth/me", access: { staff: "viewer" }, rateLimit: adminApiRateLimit },
  async ({ actor }) => NextResponse.json({
    user: { id: String(actor.id), email: actor.email, name: actor.name, role: actor.role },
  }),
);

// PATCH /api/admin/auth/me — change one's own password.
export const PATCH = defineRoute(
  {
    name: "admin/auth/me",
    access: { staff: "viewer" },
    rateLimit: adminApiRateLimit,
    body: z.object({
      currentPassword: GivenPassword,
      newPassword:     NewPassword,
    }),
  },
  async ({ ip, actor, body, tooMany, audit }) => {
    // A credential check, so it spends the sign-in budget: a borrowed session
    // must not become a fast way to guess the password.
    const attempt = await adminLoginAttempt(actor.email, ip, null);
    if (!attempt.result.allowed) return tooMany(attempt.result);

    await changeOwnStaffPassword(actor, body.currentPassword, body.newPassword);
    await resetAccountAttempts("login", actor.email);
    await audit("admin_password_change", { severity: "warn" });
    // Every other session of the account was signed out; this one stays.
    return NextResponse.json({ ok: true });
  },
);
