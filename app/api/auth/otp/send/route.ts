import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { otpSendRateLimit, otpSendIpRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { issueOtp } from "@/lib/otp";
import { sendOtp, smsEnabled } from "@/lib/sms";
import { auditLog } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const Schema = z.object({
  phone:   z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
  purpose: z.literal("password_reset"),
});

// Local-only affordance: echo the code back so the flow is testable without a
// live SMS line. Guarded by an explicit env flag and never on in production.
const DEV_ECHO = process.env.OTP_DEV_ECHO === "1" && process.env.NODE_ENV !== "production";

// POST /api/auth/otp/send — start a phone-verified flow (public)
async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);

  const ipRl = otpSendIpRateLimit(ip);
  if (!ipRl.allowed) return rateLimited(ipRl, { endpoint: "auth/otp/send", ip });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }
  const { phone, purpose } = parsed.data;

  const phoneRl = otpSendRateLimit(phone);
  if (!phoneRl.allowed) return rateLimited(phoneRl, { endpoint: "auth/otp/send", ip });

  // Only actually issue a code if the account exists — but respond the same
  // either way so this endpoint can't be used to check which numbers are
  // registered.
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  let devCode: string | undefined;
  if (user) {
    const code = await issueOtp(phone, purpose);
    const r = await sendOtp(phone, code);
    auditLog("otp_sent", "info", { ip, details: { purpose, delivered: r.sent, smsEnabled } });
    if (DEV_ECHO) devCode = code;
  }

  return NextResponse.json(
    { ok: true, message: "اگر این شماره ثبت شده باشد، کد تأیید ارسال شد.", ...(devCode ? { devCode } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withApiLog("auth/otp/send", POSTHandler);
