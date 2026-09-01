import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { getBillboardById, updateBillboard, deleteBillboard, hasActiveReservations } from "@/lib/db/billboards";

const ALLOWED_TYPES    = new Set(["billboard", "digital", "bridge", "station", "vehicle"]);
const ALLOWED_STATUSES = new Set(["available", "busy", "reserved", "inactive"]);

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>, req: NextRequest) {
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  const rl = adminApiRateLimit(getIP(req));
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
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ billboard: updated }, { headers: { "Cache-Control": "no-store" } });
}

// DELETE /api/admin/billboards/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
