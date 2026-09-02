import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission, hashPassword } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const ROLES = ["viewer", "editor", "admin", "super_admin"] as const;

const CreateSchema = z.object({
  email:    z.string().email().max(254).toLowerCase().trim(),
  name:     z.string().min(1).max(120).trim(),
  role:     z.enum(ROLES),
  password: z.string().min(8).max(128),
});

// GET /api/admin/users — list admin accounts (super_admin only)
async function GETHandler(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  if (!hasPermission(session.role, "super_admin")) {
    return NextResponse.json({ error: "فقط سوپر ادمین به مدیریت کاربران دسترسی دارد" }, { status: 403 });
  }

  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ admins, currentId: Number.parseInt(session.userId, 10) }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/admin/users — create an admin account (super_admin only)
async function POSTHandler(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  if (!hasPermission(session.role, "super_admin")) {
    return NextResponse.json({ error: "فقط سوپر ادمین می‌تواند کاربر بسازد" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const { email, name, role, password } = parsed.data;

  const clash = await prisma.admin.findUnique({ where: { email }, select: { id: true } });
  if (clash) return NextResponse.json({ error: "کاربری با این ایمیل از قبل وجود دارد" }, { status: 409 });

  const created = await prisma.admin.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });

  const actorId = Number.parseInt(session.userId, 10);
  await persistAudit({
    action: "admin_user_create",
    severity: "warn",
    adminId: Number.isNaN(actorId) ? null : actorId,
    userEmail: session.email,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    details: { newAdminId: created.id, email: created.email, role: created.role },
  });

  return NextResponse.json({ admin: created }, { headers: { "Cache-Control": "no-store" } });
}

export const GET  = withApiLog("admin/users", GETHandler);
export const POST = withApiLog("admin/users", POSTHandler);
