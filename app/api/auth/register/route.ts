import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { registrationRateLimit, resetUserLoginAttempts } from "@/lib/auth/rate-limit";
import { sendSms } from "@/lib/sms";
import { withApiLog } from "@/lib/api-log";

const RegisterSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  phone:    z.string().regex(/^09[0-9]{9}$/, "شماره موبایل معتبر نیست"),
  password: z.string().min(6).max(128),
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

  const { name, phone, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user: { id: number; name: string; phone: string };
  try {
    user = await prisma.user.create({ data: { name, phone, passwordHash } });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
    }
    throw e;
  }

  const token = await createSession({ userId: user.id.toString(), email: phone, name: user.name, role: "user" });
  resetUserLoginAttempts(ip);

  // Welcome SMS — fire-and-forget, a no-op unless KAVENEGAR_API_KEY is set, and
  // never allowed to fail the registration.
  void sendSms(phone, "به رسامپ خوش آمدید. حساب کاربری شما با موفقیت ساخته شد.");

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token, req));
  return res;
}

export const POST = withApiLog("auth/register", POSTHandler);
