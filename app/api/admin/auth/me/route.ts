import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { startSession } from "@/lib/auth/actor";
import { adminApiRateLimit, adminLoginAttempt, resetAccountAttempts } from "@/lib/rate-limit";
import { changeOwnStaffPassword } from "@/lib/db/staff";

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
      currentPassword: z.string().min(1).max(128),
      newPassword:     z.string().min(8, "رمز جدید باید حداقل ۸ نویسه باشد").max(128),
    }),
  },
  async ({ req, ip, actor, body, tooMany, audit }) => {
    // The current password is a credential check like a sign-in, so it spends
    // the same budget: a borrowed session must not become a way to guess the
    // password behind it at 600 tries a minute.
    const attempt = await adminLoginAttempt(actor.email, ip, null);
    if (!attempt.result.allowed) return tooMany(attempt.result);

    const account = await changeOwnStaffPassword(actor, body.currentPassword, body.newPassword);
    await resetAccountAttempts("login", actor.email);
    await audit("admin_password_change", { severity: "warn" });
    // Every session was signed out by the change; this device gets a new one.
    return startSession(NextResponse.json({ ok: true }), { kind: "staff", ...account }, req);
  },
);
