import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { otpVerifyRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { verifyOtp } from "@/lib/otp";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

// Verify the code and set a new password in one step — no intermediate token to
// track. `purpose` is fixed to password_reset for now.
const Schema = z.object({
  phone:       z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
  purpose:     z.literal("password_reset"),
  code:        z.string().regex(/^\d{6}$/, "کد باید ۶ رقم باشد"),
  newPassword: z.string().min(6).max(128),
});

const OTP_ERROR: Record<string, string> = {
  not_found:         "کدی برای این شماره پیدا نشد. دوباره درخواست کد بدهید.",
  expired:           "کد منقضی شده است. دوباره درخواست کد بدهید.",
  too_many_attempts: "تعداد تلاش‌ها بیش از حد مجاز است. دوباره درخواست کد بدهید.",
  mismatch:          "کد وارد شده نادرست است.",
};

// POST /api/auth/otp/verify — finish a phone-verified password reset (public)
async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }
  const { phone, purpose, code, newPassword } = parsed.data;

  const rl = otpVerifyRateLimit(phone);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "auth/otp/verify", ip });

  const check = await verifyOtp(phone, purpose, code);
  if (!check.ok) {
    return NextResponse.json({ error: OTP_ERROR[check.reason] ?? "کد نامعتبر است" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (!user) {
    // The code was valid, so the account existed when it was issued; treat a
    // now-missing user as a generic failure.
    return NextResponse.json({ error: "امکان تغییر رمز نیست" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });

  await persistAudit({
    action: "password_reset_self",
    severity: "warn",
    ip,
    userAgent: req.headers.get("user-agent"),
    details: { userId: user.id, via: "otp" },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiLog("auth/otp/verify", POSTHandler);
