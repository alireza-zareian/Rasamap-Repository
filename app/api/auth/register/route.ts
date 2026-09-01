import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { registrationRateLimit, resetUserLoginAttempts } from "@/lib/auth/rate-limit";

const RegisterSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  phone:    z.string().regex(/^09[0-9]{9}$/, "شماره موبایل معتبر نیست"),
  password: z.string().min(6).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = registrationRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً بعداً امتحان کنید." }, { status: 429 });
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

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token));
  return res;
}
