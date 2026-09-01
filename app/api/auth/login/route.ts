import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { userLoginRateLimit, resetUserLoginAttempts } from "@/lib/auth/rate-limit";

const DUMMY_HASH = "$2a$12$dummy.hash.for.timing.safety.padding.1234567890";

const LoginSchema = z.object({
  phone:    z.string().regex(/^09[0-9]{9}$/, "شماره موبایل معتبر نیست"),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = userLoginRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً بعداً امتحان کنید." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 400 });
  }

  const { phone, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });

  // Timing-safe: always run bcrypt even when user not found
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match) {
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const token = await createSession({ userId: user.id.toString(), email: user.phone, name: user.name, role: "user" });
  resetUserLoginAttempts(ip);

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token));
  return res;
}
