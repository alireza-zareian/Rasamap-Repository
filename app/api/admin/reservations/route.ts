import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";

const ALLOWED_STATUSES = new Set(["pending", "confirmed", "cancelled", ""]);

const QuerySchema = z.object({
  status: z.string().max(20).optional().default(""),
  page:   z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
});

// GET /api/admin/reservations — admin/editor+
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  if (!hasPermission(session.role, "editor")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  const sp = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    status: sp.get("status") ?? "",
    page:   sp.get("page")   ?? "1",
    limit:  sp.get("limit")  ?? "20",
  });
  if (!parsed.success) return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });

  const { status, page, limit } = parsed.data;
  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "وضعیت نامعتبر" }, { status: 400 });
  }

  const where = status ? { status } : {};

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      include: {
        billboard: { select: { id: true, name: true, city: true, price: true } },
        user:      { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.reservation.count({ where }),
  ]);

  return NextResponse.json({
    reservations,
    total,
    pages: Math.ceil(total / limit),
  }, { headers: { "Cache-Control": "no-store" } });
}
