import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { persistAudit } from "@/lib/auth/audit";
import { getBillboardById, updateBillboard, deleteBillboard, hasActiveReservations } from "@/lib/db/billboards";
import { withApiLog } from "@/lib/api-log";

function adminIdOf(session: Awaited<ReturnType<typeof getSession>>): number | null {
  const n = Number.parseInt(session?.userId ?? "", 10);
  return Number.isNaN(n) ? null : n;
}

const ALLOWED_TYPES    = new Set(["billboard", "digital", "bridge", "station", "vehicle"]);
const ALLOWED_STATUSES = new Set(["available", "busy", "reserved", "inactive"]);

function authGuard(session: Awaited<ReturnType<typeof getSession>>, req: NextRequest) {
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  return null;
}

const UpdateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  location:    z.string().max(500).optional(),
  city:        z.string().min(1).max(100).optional(),
  type:        z.string().optional(),
  status:      z.string().optional(),
  lat:         z.number().min(24).max(40).nullable().optional(),
  lng:         z.number().min(44).max(64).nullable().optional(),
  price:       z.number().min(0).optional(),
  description: z.string().max(2000).optional(),
  agency:      z.string().max(200).optional(),
  phone:       z.string().max(50).optional(),
  width:       z.number().min(0).optional(),
  height:      z.number().min(0).optional(),
  faces:       z.number().int().min(1).optional(),
});

// PUT /api/admin/billboards/[id]
async function PUTHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const guard = authGuard(session, req);
  if (guard) return guard;

  if (!["super_admin", "admin", "editor"].includes(session!.role)) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  const existing = await getBillboardById(id);
  if (!existing) return NextResponse.json({ error: "بیلبورد یافت نشد" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "اطلاعات نامعتبر", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (data.type !== undefined && !ALLOWED_TYPES.has(data.type)) {
    return NextResponse.json({ error: "نوع رسانه نامعتبر است" }, { status: 400 });
  }
  if (data.status !== undefined && !ALLOWED_STATUSES.has(data.status)) {
    return NextResponse.json({ error: "وضعیت نامعتبر است" }, { status: 400 });
  }

  const updated = await updateBillboard(id, data);
  if (!updated) return NextResponse.json({ error: "خطا در بروزرسانی" }, { status: 500 });

  await persistAudit({
    action: "billboard_update",
    adminId: adminIdOf(session),
    userEmail: session!.email,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    details: { billboardId: id, changed: Object.keys(data) },
  });

  return NextResponse.json({ billboard: updated }, { headers: { "Cache-Control": "no-store" } });
}

// DELETE /api/admin/billboards/[id]
async function DELETEHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const guard = authGuard(session, req);
  if (guard) return guard;

  if (!["super_admin", "admin"].includes(session!.role)) {
    return NextResponse.json({ error: "فقط ادمین می‌تواند بیلبورد حذف کند" }, { status: 403 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  const existing = await getBillboardById(id);
  if (!existing) return NextResponse.json({ error: "بیلبورد یافت نشد" }, { status: 404 });

  const hasReservations = await hasActiveReservations(id);
  if (hasReservations) {
    return NextResponse.json({ error: "نمی‌توان بیلبوردی با رزرو فعال را حذف کرد" }, { status: 409 });
  }

  const ok = await deleteBillboard(id);
  if (!ok) return NextResponse.json({ error: "خطا در حذف" }, { status: 500 });

  await persistAudit({
    action: "billboard_delete",
    severity: "warn",
    adminId: adminIdOf(session),
    userEmail: session!.email,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    details: { billboardId: id, slug: existing.slug, name: existing.name },
  });

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export const PUT = withApiLog("admin/billboards/[id]", PUTHandler);
export const DELETE = withApiLog("admin/billboards/[id]", DELETEHandler);
