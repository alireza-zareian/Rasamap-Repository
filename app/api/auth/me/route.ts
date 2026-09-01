import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession, createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { userApiRateLimit } from "@/lib/auth/rate-limit";

const TWO_HOURS = 2 * 60 * 60; // seconds

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

// GET /api/auth/me — return current user + sliding session refresh
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const res = NextResponse.json({
    user: { id: session.userId, name: session.name, phone: session.email },
  });

  // Sliding window: refresh token if less than 2 hours remain
  if (session.exp && session.exp - Math.floor(Date.now() / 1000) < TWO_HOURS) {
    const newToken = await createSession({
      userId: session.userId,
      email:  session.email,
      role:   session.role,
      name:   session.name,
    });
    res.headers.set("Set-Cookie", buildSessionCookieHeader(newToken));
  }

  return res;
}

const PatchSchema = z.object({
  name:            z.string().min(2).max(100).trim().optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword:     z.string().min(6).max(128).optional(),
}).refine(data => !(data.newPassword && !data.currentPassword), {
  message: "برای تغییر رمز، رمز فعلی لازم است",
});

// PATCH /api/auth/me — update name and/or password
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const rl = userApiRateLimit(getIP(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const { name, currentPassword, newPassword } = parsed.data;

  if (!name && !newPassword) {
    return NextResponse.json({ error: "هیچ تغییری ارائه نشده است" }, { status: 400 });
  }

  const userId = parseInt(session.userId, 10);
  if (isNaN(userId)) return NextResponse.json({ error: "نشست نامعتبر است" }, { status: 401 });

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });

  if (newPassword && currentPassword) {
    const ok = await bcrypt.compare(currentPassword, existing.passwordHash);
    if (!ok) return NextResponse.json({ error: "رمز فعلی اشتباه است" }, { status: 400 });
  }

  const updateData: { name?: string; passwordHash?: string } = {};
  if (name) updateData.name = name;
  if (newPassword) updateData.passwordHash = await bcrypt.hash(newPassword, 12);

  let updated: { id: number; name: string; phone: string };
  try {
    updated = await prisma.user.update({
      where:  { id: userId },
      data:   updateData,
      select: { id: true, name: true, phone: true },
    });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
    }
    throw e;
  }

  const newToken = await createSession({
    userId: session.userId,
    email:  session.email,
    role:   session.role,
    name:   updated.name,
  });

  const res = NextResponse.json({ user: { id: updated.id, name: updated.name, phone: updated.phone } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(newToken));
  return res;
}
