import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const ROLES = ["viewer", "editor", "admin", "super_admin"] as const;

const PatchSchema = z
  .object({
    role:   z.enum(ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine(d => d.role !== undefined || d.active !== undefined, { message: "تغییری ارسال نشده" });

// PATCH /api/admin/users/[id] — change role / active flag (super_admin only)
async function PATCHHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "admin/users/[id]", ip });

  if (!hasPermission(session.role, "super_admin")) {
    return NextResponse.json({ error: "فقط سوپر ادمین می‌تواند کاربر را تغییر دهد" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (Number.isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const actorId = Number.parseInt(session.userId, 10);
  if (id === actorId) {
    return NextResponse.json({ error: "نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید" }, { status: 409 });
  }

  const existing = await prisma.admin.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, active: true },
  });
  if (!existing) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });

  const data = parsed.data;
  const updated = await prisma.admin.update({
    where: { id },
    data: { ...(data.role !== undefined ? { role: data.role } : {}), ...(data.active !== undefined ? { active: data.active } : {}) },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });

  await persistAudit({
    action: "admin_user_update",
    severity: "warn",
    adminId: Number.isNaN(actorId) ? null : actorId,
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    details: {
      targetAdminId: id,
      targetEmail: existing.email,
      ...(data.role !== undefined ? { role: { from: existing.role, to: data.role } } : {}),
      ...(data.active !== undefined ? { active: { from: existing.active, to: data.active } } : {}),
    },
  });

  return NextResponse.json({ admin: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withApiLog("admin/users/[id]", PATCHHandler);
