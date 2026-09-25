import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { isClientIpTrusted } from "@/lib/auth/client-ip";
import { startSession } from "@/lib/auth/actor";
import { knownDevice, rememberDevice } from "@/lib/auth/device";
import { adminLoginAttempt, resetAccountAttempts } from "@/lib/rate-limit";
import { verifyStaffCredentials } from "@/lib/db/staff";
import { auditLog } from "@/lib/audit";

// POST /api/admin/auth/login — the staff-only sign-in form.
export const POST = defineRoute(
  {
    name: "admin/auth/login",
    access: "public",
    // This account (or this known device), then this address — see
    // credentialAttempt in lib/rate-limit.
    rateLimit: { afterBody: async (b, ip, req) => adminLoginAttempt(b.email, ip, await knownDevice(req, b.email)) },
    body: z.object({
      email:    z.string().email().max(254).toLowerCase().trim(),
      password: z.string().min(8).max(128),
    }),
    // Generic — never say which field was wrong.
    messages: { invalidBody: "ایمیل یا رمز عبور نادرست است" },
  },
  async ({ req, ip, userAgent, body }) => {
    const staff = await verifyStaffCredentials(body.email, body.password);

    if (!staff) {
      auditLog("login_failure", "warn", {
        ip,
        userAgent: userAgent ?? undefined,
        // Without a proxy chain to vouch for it, `ip` is a value this caller
        // supplied about itself. Recording that keeps the row honest about
        // what it witnessed — see isClientIpTrusted.
        details: { email: body.email, ipTrusted: isClientIpTrusted(req) },
      });
      // Same response for a wrong email and a wrong password (no enumeration).
      return NextResponse.json({ error: "ایمیل یا رمز عبور اشتباه است" }, { status: 401 });
    }

    await resetAccountAttempts("login", body.email, await knownDevice(req, body.email));
    auditLog("login_success", "info", {
      userId: `staff:${staff.id}`, userEmail: staff.email, ip, userAgent: userAgent ?? undefined,
    });

    const res = NextResponse.json({ ok: true, user: { id: String(staff.id), name: staff.name, role: staff.role } });
    await rememberDevice(res, req, body.email);
    return startSession(res, { kind: "staff", ...staff }, req);
  },
);
