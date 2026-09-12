import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { registrationRateLimit, otpVerifyRateLimit } from "@/lib/auth/rate-limit";
import { verifyOtp, otpErrorMessage } from "@/lib/otp";
import { sendSms } from "@/lib/sms";
import { withApiLog } from "@/lib/api-log";

// An account is opened only on a number whose owner answered a code sent to it.
// The number is the identity here — it is what signs in, what a reset is sent
// to, and what an advertiser is called back on — so a sign-up that never proves
// it is a sign-up that lets anyone mint accounts on other people's numbers.
const RegisterSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  phone:    z.string().regex(/^09[0-9]{9}$/, "شماره موبایل معتبر نیست"),
  password: z.string().min(6).max(128),
  code:     z.string().regex(/^\d{6}$/, "کد تأیید باید ۶ رقم باشد"),
});

async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = registrationRateLimit(ip);
  if (!rl.allowed) {
    // The shared helper adds Retry-After and says how many minutes to wait —
    // these lock for a quarter of an hour or more, so "try later" is not enough.
    return rateLimited(rl, { endpoint: "auth/register", ip });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const { name, phone, password, code } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
  }

  // The duplicate check comes first on purpose: a code is single-use, and
  // burning it to tell someone a number they cannot have is taken would make
  // them ask for a fresh one before they could try another number.
  const codeRl = otpVerifyRateLimit(phone);
  if (!codeRl.allowed) return rateLimited(codeRl, { endpoint: "auth/register", ip });

  const check = await verifyOtp(phone, "register", code);
  if (!check.ok) {
    return NextResponse.json({ error: otpErrorMessage(check.reason) }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user: { id: number; name: string; phone: string };
  try {
    user = await prisma.user.create({ data: { name, phone, passwordHash } });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
    }
    throw e;
  }

  const token = await createSession({ userId: user.id.toString(), email: phone, name: user.name, role: "user" });

  // Welcome SMS — fire-and-forget, a no-op unless KAVENEGAR_API_KEY is set, and
  // never allowed to fail the registration.
  void sendSms(phone, "به رسامپ خوش آمدید. حساب کاربری شما با موفقیت ساخته شد.");

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token, req));
  return res;
}

export const POST = withApiLog("auth/register", POSTHandler);
