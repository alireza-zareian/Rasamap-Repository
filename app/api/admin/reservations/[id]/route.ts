import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const PatchSchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
});

// PATCH /api/admin/reservations/[id] — admin+
async function PATCHHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "فقط ادمین می‌تواند وضعیت رزرو را تغییر دهد" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const existing = await prisma.reservation.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "رزرو یافت نشد" }, { status: 404 });
  if (existing.status === "cancelled") {
    return NextResponse.json({ error: "رزرو لغو شده قابل تغییر نیست" }, { status: 409 });
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data:  { status: parsed.data.status },
    include: {
      billboard: { select: { name: true } },
      user:      { select: { name: true } },
    },
  });

  const adminId = Number.parseInt(session.userId, 10);
  await persistAudit({
    action: "reservation_status_change",
    adminId: Number.isNaN(adminId) ? null : adminId,
    userEmail: session.email,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    details: { reservationId: id, from: existing.status, to: parsed.data.status },
  });

  return NextResponse.json({ reservation: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withApiLog("admin/reservations/[id]", PATCHHandler);
