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
  purpose: z.enum(["password_reset", "register"]),
});

// Local-only affordance: echo the code back so the flow is testable without a
// live SMS line. Guarded by an explicit env flag and never on in production.
const DEV_ECHO = process.env.OTP_DEV_ECHO === "1" && process.env.NODE_ENV !== "production";

// POST /api/auth/otp/send — start a phone-verified flow: reset or sign-up (public)
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

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });

  // A number already in the table is the answer to sign-up and the requirement
  // for a reset, so the two purposes read the same row in opposite directions.
  //
  // Only one of them can stay silent about what it found. A reset says nothing:
  // it issues a code when the account exists and returns the identical body
  // when it does not, so the endpoint cannot be used to test whether a number
  // is registered. Sign-up answers plainly, because it has nothing left to
  // hide — an account cannot be opened twice on one number, so the step that
  // creates it must refuse a duplicate anyway, and staying quiet here would
  // only leave a visitor who mistyped one digit waiting for a code that was
  // never going to arrive. What bounds the abuse is the per-phone ceiling
  // above (three in ten minutes), not silence this side of it.
  if (purpose === "register" && user) {
    return NextResponse.json(
      { error: "این شماره قبلاً ثبت شده است. وارد شوید یا رمز عبور را بازیابی کنید." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Past that guard a sign-up always holds a free number; a reset issues only
  // when the account exists.
  let devCode: string | undefined;
  if (purpose === "register" || user) {
    const code = await issueOtp(phone, purpose);
    const r = await sendOtp(phone, code);
    auditLog("otp_sent", "info", { ip, details: { purpose, delivered: r.sent, smsEnabled } });
    if (DEV_ECHO) devCode = code;
  }

  const message = purpose === "register"
    ? "کد تأیید به این شماره ارسال شد."
    : "اگر این شماره ثبت شده باشد، کد تأیید ارسال شد.";

  return NextResponse.json(
    { ok: true, message, ...(devCode ? { devCode } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withApiLog("auth/otp/send", POSTHandler);
